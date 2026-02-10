/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { I18n, I18nService } from 'nestjs-i18n';
import { MessageResponseDto } from 'src/common/dto/message-response.dto';
import {
  COOKIE_PATH,
  COOKIE_SAME_SITE,
  IDENTITY_REFRESH_TOKEN_COOKIE_NAME,
  IDENTITY_TOKEN_COOKIE_NAME,
  TENANT_ACCESS_TOKEN_COOKIE_NAME,
  TENANT_REFRESH_TOKEN_COOKIE_NAME,
} from 'src/common/swagger/common';
import { GlobalRole } from 'src/common/types';
import { DatabaseService } from 'src/database/database.service';
import { User } from 'src/modules/users/entities/user.entity';
// TokenType removed - no longer storing refresh tokens in database
import { I18nKeys } from '../../common/constants/i18n-keys';
import { EmailVerificationRepository } from '../../repositories/users/email-verification.repository';
// RefreshTokenRepository removed - Redis sessions replace refresh_tokens table
import { UserTenantRepository } from '../../repositories/users/user-tenant.repository';
import { UserRepository } from '../../repositories/users/user.repository';
import { InvitationsService } from '../invitations/invitations.service';
import { TenantService } from '../tenants/tenant.service';
import { SERVICE_NAME } from './constants/session.constants';
import {
  ForgotPasswordDto,
  InvitationListResponseDto,
  LoginDto,
  LoginResponseDto,
  ResetPasswordDto,
  ResolveInvitationResponseDto,
  SignupDto,
  TenantSwitchResponseDto,
  VerifyEmailDto,
} from './dto';
import { GeoLocationService } from './services/geo-location.service';
import { SessionInvalidationService } from './services/session-invalidation.service';
import { SessionService } from './services/session.service';
import { UserAgentParserService } from './services/user-agent-parser.service';
import {
  AuthenticatedIdentityUser,
  IdentityPayload,
  IdentityRefreshPayload,
  TenantPayload,
  TenantRefreshPayload,
} from './strategies';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_ROUNDS = 10;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tenantService: TenantService,
    // RefreshTokenRepository removed - Redis sessions replace refresh_tokens table
    // Refresh tokens are now JWT-only (signed, with sessionId)
    // Validation = check if sessionId exists in Redis (O(1) lookup)
    // No database storage, no token rotation, instant revocation via session deletion
    private readonly emailVerificationRepository: EmailVerificationRepository,
    private readonly userRepository: UserRepository,
    private readonly userTenantRepository: UserTenantRepository,
    private readonly databaseService: DatabaseService,
    private readonly invitationsService: InvitationsService,
    private readonly sessionService: SessionService,
    private readonly sessionInvalidationService: SessionInvalidationService,
    private readonly userAgentParser: UserAgentParserService,
    private readonly geoLocationService: GeoLocationService,
    @I18n() private readonly i18n: I18nService,
  ) {}

  /**
   * Set HTTP-only auth cookies on the response
   */
  /**
   * Set identity tokens (access + refresh)
   * Used after login
   */
  setIdentityTokens(
    reply: FastifyReply,
    identityAccessToken: string,
    identityRefreshToken: string,
  ): void {
    const isProduction =
      this.configService.get<string>('app.environment') === 'production';

    const identityExpiresIn =
      this.configService.get<string>('jwt.identityExpiresIn') || '15m';
    const sessionMaxTtl =
      this.configService.get<string>('jwt.sessionMaxTtl') || '14d';

    // Set identity access token cookie
    reply.setCookie(IDENTITY_TOKEN_COOKIE_NAME, identityAccessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: COOKIE_SAME_SITE,
      path: COOKIE_PATH,
      maxAge: Math.floor(this.parseExpiresIn(identityExpiresIn) / 1000),
    });

    // Set identity refresh token cookie
    reply.setCookie(IDENTITY_REFRESH_TOKEN_COOKIE_NAME, identityRefreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: COOKIE_SAME_SITE,
      path: COOKIE_PATH,
      maxAge: Math.floor(this.parseExpiresIn(sessionMaxTtl) / 1000),
    });
  }

  /**
   * Set tenant tokens (access + refresh)
   * Used after tenant selection
   */
  setTenantTokens(
    reply: FastifyReply,
    tenantAccessToken: string,
    tenantRefreshToken: string,
  ): void {
    const isProduction =
      this.configService.get<string>('app.environment') === 'production';

    const accessExpiresIn =
      this.configService.get<string>('jwt.accessExpiresIn') || '30m';
    const sessionMaxTtl =
      this.configService.get<string>('jwt.sessionMaxTtl') || '14d';

    // Set tenant access token cookie
    reply.setCookie(TENANT_ACCESS_TOKEN_COOKIE_NAME, tenantAccessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: COOKIE_SAME_SITE,
      path: COOKIE_PATH,
      maxAge: Math.floor(this.parseExpiresIn(accessExpiresIn) / 1000),
    });

    // Set tenant refresh token cookie
    reply.setCookie(TENANT_REFRESH_TOKEN_COOKIE_NAME, tenantRefreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: COOKIE_SAME_SITE,
      path: COOKIE_PATH,
      maxAge: Math.floor(this.parseExpiresIn(sessionMaxTtl) / 1000),
    });
  }

  /**
   * Clear identity tokens (access + refresh)
   */
  clearIdentityTokens(reply: FastifyReply): void {
    const isProduction =
      this.configService.get<string>('app.environment') === 'production';

    reply.clearCookie(IDENTITY_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: isProduction,
      sameSite: COOKIE_SAME_SITE,
      path: COOKIE_PATH,
    });

    reply.clearCookie(IDENTITY_REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: isProduction,
      sameSite: COOKIE_SAME_SITE,
      path: COOKIE_PATH,
    });
  }

  /**
   * Clear tenant tokens (access + refresh)
   */
  clearTenantTokens(reply: FastifyReply): void {
    const isProduction =
      this.configService.get<string>('app.environment') === 'production';

    reply.clearCookie(TENANT_ACCESS_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: isProduction,
      sameSite: COOKIE_SAME_SITE,
      path: COOKIE_PATH,
    });

    reply.clearCookie(TENANT_REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: isProduction,
      sameSite: COOKIE_SAME_SITE,
      path: COOKIE_PATH,
    });
  }

  /**
   * Clear all auth cookies (identity + tenant)
   */
  clearAllAuthCookies(reply: FastifyReply): void {
    this.clearIdentityTokens(reply);
    this.clearTenantTokens(reply);
  }

  /**
   * Registers a new user and creates their first tenant.
   *
   * @remarks
   * - Creates a new user account
   * - Creates a new tenant with default plan and features
   * - Links the user to the tenant with admin role in user_tenants table
   * - Creates email verification token
   *
   * @param signupDto - User registration information
   * @returns An object containing a success message, userId, tenantId, and an email verification token (remove in production)
   * @throws {ConflictException} if the email is already registered
   */
  async signup(signupDto: SignupDto): Promise<MessageResponseDto> {
    const existingUser = await this.userRepository.findOne({
      filters: {
        email: signupDto.email,
      },
      select: ['id'],
    });
    if (existingUser) {
      throw new ConflictException(
        this.i18n.t(I18nKeys.EMAIL_ALREADY_REGISTERED),
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(
      signupDto.password,
      this.BCRYPT_ROUNDS,
    );

    return this.databaseService.transaction(async (client) => {
      // Create user account
      this.logger.log(`Creating user account for ${signupDto.email}`);
      const { id: userId } = await this.userRepository.create(
        {
          email: signupDto.email,
          password_hash: passwordHash,
          first_name: signupDto.firstName ?? null,
          last_name: signupDto.lastName ?? null,
          is_verified: false,
          is_system_admin: false,
        },
        { client },
      );

      // Create email verification record
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto
        .createHash('sha256')
        .update(verificationToken)
        .digest('hex');

      const expiresAt = new Date(
        Date.now() +
          this.parseExpiresIn(
            this.configService.get<string>('EMAIL_VERIFICATION_EXPIRES_IN') ||
              '1d',
          ),
      );
      this.logger.log(
        `Creating email verification record for ${signupDto.email}`,
      );
      await this.emailVerificationRepository.createEmailVerification(
        {
          userId,
          token: hashedToken,
          expiresAt,
        },
        { client },
      );

      // TODO: Hook in actual email sending here
      this.logger.log(
        `Verification token for ${signupDto.email}: ${verificationToken}`,
      );

      const result = {
        message: this.i18n.t(I18nKeys.SIGNUP_SUCCESS),
      } as unknown as MessageResponseDto & { verificationToken: string };

      if (this.configService.get<string>('NODE_ENV') !== 'production') {
        (result as unknown as { verificationToken: string }).verificationToken =
          verificationToken;
      }

      return result;
    });
  }

  /**
   * Login user and generate identity token
   * Returns user info and list of available tenants
   * Note: This is NOT for system admins
   */
  async login(
    loginDto: LoginDto,
    request: FastifyRequest,
  ): Promise<
    LoginResponseDto & {
      identityAccessToken: string;
      identityRefreshToken: string;
    }
  > {
    // Validate user credentials
    const user = await this.validateUser(loginDto.email, loginDto.password);

    // Check if user is verified
    if (!user.is_verified) {
      throw new UnauthorizedException(this.i18n.t(I18nKeys.EMAIL_NOT_VERIFIED));
    }

    // Determine global roles
    const globalRoles: GlobalRole[] = user.is_system_admin
      ? [GlobalRole.SYSTEM_ADMIN]
      : [];

    // Create identity session with device/geo metadata
    const identitySessionId = crypto.randomUUID();

    // Parse User-Agent for device info
    const userAgentString = request.headers['user-agent'];
    const deviceInfo = this.userAgentParser.parse(userAgentString);

    // Get IP address (handle proxy headers)
    const ipAddress =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (request.headers['x-real-ip'] as string) ||
      request.ip ||
      '127.0.0.1';

    // Lookup geolocation
    const geoLocation = this.geoLocationService.lookup(ipAddress);

    // Create identity session in Redis
    await this.sessionService.createIdentitySession(identitySessionId, {
      userId: user.id,
      email: user.email,
      globalRoles,
      deviceInfo,
      ipAddress,
      geoLocation,
      serviceName: SERVICE_NAME,
    });

    // Generate identity tokens (access + refresh) with sessionId
    const { identityAccessToken, identityRefreshToken } =
      await this.generateIdentityTokens(
        user.id,
        user.email,
        globalRoles,
        identitySessionId,
      );

    // Get user's active tenants
    const userTenants = await this.userTenantRepository.getActiveUserTenants(
      user.id,
      { isAuthflow: true },
    );

    // Map user tenants to response format
    const tenantsWithDetails = userTenants.map((ut) => ({
      tenantId: ut.tenant_id,
      tenantName: `Temp Tenant name ${ut.tenant_id.substring(0, 8)}`,
      role: ut.role_key,
      roleName: ut.role_name,
      isActive: ut.is_active,
      joinedAt: ut.joined_at.toISOString(),
    }));

    // Get pending invitations count
    const pendingInvitationsCount =
      await this.invitationsService.countUserInvitations(user.email);

    this.logger.log(
      `User ${user.email} logged in successfully (session: ${identitySessionId}, ` +
        `device: ${deviceInfo.deviceType}, ${deviceInfo.browserName}, ` +
        `location: ${geoLocation?.city || 'Unknown'}, ${geoLocation?.country || 'Unknown'})`,
    );

    // Return user info and available tenants
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        isSystemAdmin: user.is_system_admin,
      },
      tenants: tenantsWithDetails,
      pendingInvitationsCount,
      identityAccessToken,
      identityRefreshToken,
    };
  }

  /**
   * Validate user credentials
   */
  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.userRepository.findOne({
      filters: {
        email,
      },
      select: [
        'id',
        'email',
        'password_hash',
        'first_name',
        'last_name',
        'is_verified',
        'is_system_admin',
      ],
    });
    if (!user) {
      throw new UnauthorizedException(
        this.i18n.t(I18nKeys.INVALID_CREDENTIALS),
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException(
        this.i18n.t(I18nKeys.INVALID_CREDENTIALS),
      );
    }

    return user;
  }

  /**
   * Generate identity token (for post-login, pre-tenant-selection)
   * This token is NOT for system admins - only for regular users
   */
  /**
   * Generate identity tokens (access + refresh)
   * Used after login, before tenant selection
   */
  async generateIdentityTokens(
    userId: string,
    email: string,
    globalRoles: GlobalRole[],
    sessionId: string,
  ): Promise<{ identityAccessToken: string; identityRefreshToken: string }> {
    const accessPayload: IdentityPayload = {
      sub: userId,
      email,
      globalRoles,
      sessionId, // Include session ID for Redis validation
      type: 'identity',
    };

    const refreshPayload: IdentityRefreshPayload = {
      sub: userId,
      email,
      sessionId, // Include session ID for Redis validation
      type: 'identity-refresh',
    };

    const identityAccessToken = this.jwtService.sign(
      accessPayload as any,
      {
        secret: this.configService.get<string>('jwt.identitySecret'),
        expiresIn: this.configService.get<string>('jwt.identityExpiresIn'),
      } as any,
    );

    const identityRefreshToken = this.jwtService.sign(
      refreshPayload as any,
      {
        secret:
          this.configService.get<string>('jwt.identityRefreshSecret') ||
          this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.sessionMaxTtl') || '14d',
      } as any,
    );

    // No database storage - Redis session (created before calling this method) is the source of truth
    // Refresh token is JWT-only with embedded sessionId
    // Validation = check sessionId exists in Redis (done by JwtAuthRefreshGuard)

    return { identityAccessToken, identityRefreshToken };
  }

  /**
   * Generate tenant tokens (access + refresh)
   * Used after tenant selection
   * Now includes sessionId for Redis session tracking
   */
  async generateTenantTokens(
    userId: string,
    email: string,
    tenantId: string,
    role: string,
    sessionId: string,
  ): Promise<{ tenantAccessToken: string; tenantRefreshToken: string }> {
    const accessPayload: TenantPayload = {
      sub: userId,
      email,
      tenantId,
      role,
      sessionId, // NEW: Link token to Redis session
      type: 'tenant-access',
    };

    const refreshPayload: TenantRefreshPayload = {
      sub: userId,
      email,
      tenantId,
      sessionId, // NEW: Link token to Redis session
      type: 'tenant-refresh',
    };

    const tenantAccessToken = this.jwtService.sign(
      accessPayload as any,
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
      } as any,
    );

    const tenantRefreshToken = this.jwtService.sign(
      refreshPayload as any,
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.sessionMaxTtl') || '14d',
      } as any,
    );

    // No database storage - Redis session (created before calling this method) is the source of truth
    // Refresh token is JWT-only with embedded sessionId
    // Validation = check sessionId exists in Redis (done by JwtAuthRefreshGuard)

    return { tenantAccessToken, tenantRefreshToken };
  }

  // ============================================
  // REMOVED: Database storage methods (replaced by Redis sessions)
  // ============================================
  // The following methods were deleted because Redis sessions are now
  // the source of truth for refresh token validation:
  //
  // - storeIdentityRefreshToken() - No longer storing token hashes in database
  // - storeTenantRefreshToken() - No longer storing token hashes in database
  // - hashRefreshToken() - No longer hashing tokens for storage
  //
  // Why removed:
  // - Refresh tokens are JWT-only (signed, with embedded sessionId)
  // - Validation = check if sessionId exists in Redis (O(1) lookup)
  // - No database writes = better performance
  // - Instant revocation via session deletion (no token rotation needed)
  // ============================================

  /**
   * Parse expires in string to milliseconds
   */
  private parseExpiresIn(expiresIn: string): number {
    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1));

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return value;
    }
  }

  /**
   * Refresh identity tokens
   * Generates new identity access and refresh tokens
   * Reuses the same sessionId from the refresh token
   *
   * SIMPLIFIED: No database lookups, no token rotation
   * Session existence already validated by JwtAuthRefreshGuard
   */
  async refreshIdentityTokens(
    userId: string,
    email: string,
    sessionId: string,
  ): Promise<{ identityAccessToken: string; identityRefreshToken: string }> {
    // Session existence already validated by JwtAuthRefreshGuard
    // No need to check database - Redis session validation is done by guard

    // Get user to check system admin status
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException(this.i18n.t(I18nKeys.NOT_FOUND));
    }

    // Determine global roles
    const globalRoles: GlobalRole[] = user.is_system_admin
      ? [GlobalRole.SYSTEM_ADMIN]
      : [];

    // Generate new tokens with same sessionId
    // No token rotation - old refresh token remains valid until JWT expiry
    // Session deletion (password change, logout) is what revokes access
    const tokens = await this.generateIdentityTokens(
      userId,
      email,
      globalRoles,
      sessionId, // Reuse existing session ID
    );

    this.logger.log(
      `Identity tokens refreshed for user ${userId} (session: ${sessionId})`,
    );

    return tokens;
  }

  /**
   * Refresh tenant tokens
   * Generates new tenant access and refresh tokens for the same tenant
   * Reuses the same sessionId from the refresh token
   *
   * SIMPLIFIED: No database lookups, no token rotation
   * Session existence already validated by JwtAuthRefreshGuard
   */
  async refreshTenantTokens(
    userId: string,
    email: string,
    tenantId: string,
    sessionId: string,
  ): Promise<{ tenantAccessToken: string; tenantRefreshToken: string }> {
    // Session existence already validated by JwtAuthRefreshGuard
    // No need to check database - Redis session validation is done by guard

    // Get user's tenant membership to verify they still have access
    const userTenant = await this.databaseService.transaction(
      async (client) => {
        return this.userTenantRepository.getUserInTenant(userId, tenantId, {
          client,
          isAuthflow: true,
        });
      },
    );

    if (!userTenant || !userTenant.is_active) {
      throw new UnauthorizedException(
        this.i18n.t(I18nKeys.TENANT_ACCESS_DENIED),
      );
    }

    // Generate new tokens with same sessionId
    // No token rotation - old refresh token remains valid until JWT expiry
    // Session deletion (role change, logout) is what revokes access
    const tokens = await this.generateTenantTokens(
      userId,
      email,
      tenantId,
      userTenant.role_key,
      sessionId, // Reuse existing session ID
    );

    this.logger.log(
      `Tenant tokens refreshed for user ${userId} in tenant ${tenantId} (session: ${sessionId})`,
    );

    return tokens;
  }

  /**
   * Logout user (delete sessions)
   * Deletes both identity and tenant sessions, immediately invalidating all tokens
   */
  async logout(
    userId: string,
    identitySessionId?: string,
    tenantSessionId?: string,
    tenantId?: string,
  ) {
    // Delete sessions (immediate invalidation)
    if (identitySessionId) {
      await this.sessionService.deleteIdentitySession(
        identitySessionId,
        userId,
      );
      this.logger.log(
        `Identity session ${identitySessionId} deleted for user ${userId}`,
      );
    }

    if (tenantSessionId && tenantId) {
      await this.sessionService.deleteTenantSession(
        tenantSessionId,
        userId,
        tenantId,
      );
      this.logger.log(
        `Tenant session ${tenantSessionId} deleted for user ${userId} in tenant ${tenantId}`,
      );
    }

    this.logger.log(`User ${userId} logged out successfully`);
    return { message: this.i18n.t(I18nKeys.LOGOUT_SUCCESS) };
  }

  // ============================================
  // REMOVED: revokeRefreshToken()
  // ============================================
  // No longer needed - session deletion IS the revocation
  // When user logs out, we delete the Redis session, which immediately
  // invalidates all tokens (access + refresh) with that sessionId
  // ============================================

  /**
   * Verify email address
   */
  async verifyEmail(
    verifyEmailDto: VerifyEmailDto,
  ): Promise<MessageResponseDto> {
    const hashedToken = crypto
      .createHash('sha256')
      .update(verifyEmailDto.token)
      .digest('hex');

    const verification =
      await this.emailVerificationRepository.findByToken(hashedToken);

    if (!verification) {
      throw new BadRequestException(
        this.i18n.t(I18nKeys.INVALID_VERIFICATION_TOKEN),
      );
    }

    await this.databaseService.transaction(async (client) => {
      await this.userRepository.update(
        verification.userId,
        { is_verified: true, updated_at: new Date() },
        { client },
      );

      await this.emailVerificationRepository.markCompleted(verification.id, {
        client,
      });
    });

    this.logger.log(`Email verified for user ${verification.userId}`);

    return { message: this.i18n.t(I18nKeys.EMAIL_VERIFIED) };
  }

  /**
   * Request password reset
   */
  async forgotPassword({ email }: ForgotPasswordDto) {
    const user = await this.userRepository.findOne({
      filters: {
        email,
      },
      select: ['id'],
    });
    if (!user) {
      // Don't reveal if email exists
      return {
        message: this.i18n.t(I18nKeys.PASSWORD_RESET_EMAIL_SENT),
      };
    }

    const userId = user.id;
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    await this.userRepository.createPasswordReset({
      userId,
      token: hashedToken,
      expiresAt,
    });

    // TODO: Send password reset email
    this.logger.log(`Password reset token for ${email}: ${resetToken}`);

    const result = {
      message: this.i18n.t(I18nKeys.PASSWORD_RESET_EMAIL_SENT),
    };

    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      (result as unknown as { resetToken: string }).resetToken = resetToken;
    }

    return result;
  }

  /**
   * Reset password using token
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetPasswordDto.token)
      .digest('hex');
    const reset =
      await this.userRepository.findPasswordResetByToken(hashedToken);
    if (!reset) {
      throw new BadRequestException(
        this.i18n.t(I18nKeys.INVALID_VERIFICATION_TOKEN),
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(
      resetPasswordDto.newPassword,
      this.BCRYPT_ROUNDS,
    );

    await this.databaseService.transaction(async (client) => {
      await this.userRepository.update(
        reset.userId,
        { password_hash: passwordHash, updated_at: new Date() },
        { client },
      );

      await this.userRepository.markPasswordResetUsed(reset.id, { client });

      // No refresh token revocation - session deletion handles it
      // SessionInvalidationService.invalidateAllUserSessions() deletes Redis sessions
      // which immediately invalidates all tokens (access + refresh)
    });

    // Security event: Password reset → Invalidate all user sessions
    await this.sessionInvalidationService.invalidateAllUserSessions(
      reset.userId,
      'password_reset',
    );

    this.logger.warn(
      `Password reset for user ${reset.userId}. All sessions invalidated for security.`,
    );

    return { message: this.i18n.t(I18nKeys.PASSWORD_RESET_SUCCESS) };
  }

  /**
   * Switch to a different tenant
   * User must be authenticated with identity token
   * Creates a tenant session linked to the identity session
   */
  async tenantSwitch(
    { email, userId, sessionId: identitySessionId }: AuthenticatedIdentityUser,
    tenantId: string,
  ): Promise<
    TenantSwitchResponseDto & {
      tenantAccessToken: string;
      tenantRefreshToken: string;
    }
  > {
    return this.databaseService.transaction(async (client) => {
      // Validate that user belongs to the specified tenant
      const userTenant = await this.userTenantRepository.getUserInTenant(
        userId,
        tenantId,
        { client, isAuthflow: true },
      );

      if (!userTenant || !userTenant.is_active) {
        throw new UnauthorizedException(
          this.i18n.t(I18nKeys.TENANT_ACCESS_DENIED),
        );
      }

      // Create tenant session in Redis (linked to identity session)
      const tenantSessionId = crypto.randomUUID();

      await this.sessionService.createTenantSession(tenantSessionId, {
        userId,
        tenantId,
        role: userTenant.role_key,
        identitySessionId,
      });

      // Generate tenant tokens (access + refresh) with sessionId
      const { tenantAccessToken, tenantRefreshToken } =
        await this.generateTenantTokens(
          userId,
          email,
          tenantId,
          userTenant.role_key,
          tenantSessionId,
        );

      this.logger.log(
        `User ${email} switched to tenant ${tenantId} ` +
          `(identity session: ${identitySessionId}, tenant session: ${tenantSessionId})`,
      );

      // Return user and tenant info along with tokens
      return {
        tenantAccessToken,
        tenantRefreshToken,
        user: {
          id: userId,
          email,
          role: userTenant.role_key,
          roleName: userTenant.role_name,
        },
        tenant: {
          id: tenantId,
          name: `Temp Tenant name ${tenantId.substring(0, 8)}`,
        },
      };
    });
  }

  /**
   * Resolve invitation token (delegates to InvitationsService)
   */
  async resolveInvitation(
    token: string,
  ): Promise<ResolveInvitationResponseDto> {
    return this.invitationsService.resolveInvitation(token);
  }

  /**
   * List user's pending invitations (delegates to InvitationsService)
   */
  async listUserInvitations(email: string): Promise<InvitationListResponseDto> {
    return this.invitationsService.listUserInvitations(email);
  }

  /**
   * Accept invitation (delegates to InvitationsService)
   */
  async acceptInvitation(
    invitationId: string,
    userId: string,
    email: string,
  ): Promise<MessageResponseDto> {
    return this.invitationsService.acceptInvitation(
      invitationId,
      userId,
      email,
    );
  }

  /**
   * Reject invitation (delegates to InvitationsService)
   */
  async rejectInvitation(
    invitationId: string,
    userId: string,
    email: string,
  ): Promise<MessageResponseDto> {
    return this.invitationsService.rejectInvitation(
      invitationId,
      userId,
      email,
    );
  }
}
