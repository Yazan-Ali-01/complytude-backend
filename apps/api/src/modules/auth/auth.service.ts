import { DatabaseService } from '@lib/database';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtSignOptions } from '@nestjs/jwt';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { FastifyReply } from 'fastify';
import { I18nService } from 'nestjs-i18n';
import { MessageResponseDto } from 'src/common/dto/message-response.dto';
import {
  COOKIE_PATH,
  COOKIE_SAME_SITE,
  IDENTITY_REFRESH_TOKEN_COOKIE_NAME,
  IDENTITY_TOKEN_COOKIE_NAME,
  TENANT_ACCESS_TOKEN_COOKIE_NAME,
  TENANT_REFRESH_TOKEN_COOKIE_NAME,
} from 'src/common/swagger/common';
import { User } from 'src/modules/users/entities/user.entity';
import { TokenType } from 'src/repositories/users/interfaces/refresh-token.interfaces';
import { EmailVerificationRepository } from '../../repositories/users/email-verification.repository';
import { RefreshTokenRepository } from '../../repositories/users/refresh-token.repository';
import { UserTenantRepository } from '../../repositories/users/user-tenant.repository';
import { UserRepository } from '../../repositories/users/user.repository';
import { EmailService } from '../email/email.service';
import { InvitationsService } from '../invitations/invitations.service';
import { TenantService } from '../tenants/tenant.service';
import { UsersI18n } from '../users/constants/i18n.constants';
import { AuthI18n } from './constants/i18n.constants';
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
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly emailVerificationRepository: EmailVerificationRepository,
    private readonly userRepository: UserRepository,
    private readonly userTenantRepository: UserTenantRepository,
    private readonly databaseService: DatabaseService,
    private readonly invitationsService: InvitationsService,
    private readonly emailService: EmailService,
    private readonly i18n: I18nService,
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
    const refreshExpiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') || '14d';

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
      maxAge: Math.floor(this.parseExpiresIn(refreshExpiresIn) / 1000),
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
    const refreshExpiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') || '14d';

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
      maxAge: Math.floor(this.parseExpiresIn(refreshExpiresIn) / 1000),
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
   * Registers a new user account.
   *
   * @remarks
   * - Checks for existing email (throws ConflictException if taken)
   * - Creates a new user account (unverified)
   * - Creates email verification token
   * - Does NOT create a tenant — users create their organization
   *   separately via POST /tenants after verifying their email
   *
   * @param signupDto - User registration information
   * @returns Success message (+ verificationToken in non-production)
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
        this.i18n.t(AuthI18n.errors.EMAIL_ALREADY_REGISTERED),
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
          platform_role_key: null,
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
            this.configService.get<string>('email.verificationExpiresIn') ||
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

      this.emailService.sendVerificationEmail(
        signupDto.email,
        verificationToken,
      );

      const result = {
        message: this.i18n.t(AuthI18n.messages.SIGNUP_SUCCESS),
      } as unknown as MessageResponseDto & { verificationToken: string };

      if (this.configService.get<string>('app.environment') !== 'production') {
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
  async login(loginDto: LoginDto): Promise<
    LoginResponseDto & {
      identityAccessToken: string;
      identityRefreshToken: string;
    }
  > {
    // Validate user credentials
    const user = await this.validateUser(loginDto.email, loginDto.password);

    // Allow unverified users to login; VerifiedUserGuard blocks them from tenant creation
    const platformRole = user.platform_role_key ?? null;

    // Generate identity tokens (access + refresh)
    const { identityAccessToken, identityRefreshToken } =
      await this.generateIdentityTokens(
        user.id,
        user.email,
        user.is_verified,
        platformRole,
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

    this.logger.log(`User ${user.email} logged in successfully`);

    // Return user info and available tenants
    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        platformRole: user.platform_role_key ?? null,
        isVerified: user.is_verified,
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
        'platform_role_key',
      ],
    });
    if (!user) {
      this.logger.warn(`Login failed: user not found for email`);
      throw new UnauthorizedException(
        this.i18n.t(AuthI18n.errors.INVALID_CREDENTIALS),
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      this.logger.warn(`Login failed: invalid password for user ${user.id}`);
      throw new UnauthorizedException(
        this.i18n.t(AuthI18n.errors.INVALID_CREDENTIALS),
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
    isVerified: boolean,
    platformRole: string | null,
  ): Promise<{ identityAccessToken: string; identityRefreshToken: string }> {
    const accessPayload: IdentityPayload = {
      sub: userId,
      email,
      isVerified,
      platformRole,
      type: 'identity',
    };

    const refreshPayload: IdentityRefreshPayload = {
      sub: userId,
      email,
      type: 'identity-refresh',
    };

    const identityAccessToken = this.jwtService.sign(
      accessPayload as object,
      {
        secret: this.configService.get<string>('jwt.identitySecret'),
        expiresIn: this.configService.get<string>('jwt.identityExpiresIn'),
      } as JwtSignOptions,
    );

    const identityRefreshToken = this.jwtService.sign(
      refreshPayload as object,
      {
        secret:
          this.configService.get<string>('jwt.identityRefreshSecret') ||
          this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
      } as JwtSignOptions,
    );

    // Store identity refresh token in database
    await this.storeIdentityRefreshToken(userId, identityRefreshToken);

    return { identityAccessToken, identityRefreshToken };
  }

  /**
   * Generate tenant tokens (access + refresh)
   * Used after tenant selection
   */
  async generateTenantTokens(
    userId: string,
    email: string,
    tenantId: string,
    role: string,
  ): Promise<{ tenantAccessToken: string; tenantRefreshToken: string }> {
    const accessPayload: TenantPayload = {
      sub: userId,
      email,
      tenantId,
      role,
      type: 'tenant-access',
    };

    const refreshPayload: TenantRefreshPayload = {
      sub: userId,
      email,
      tenantId,
      type: 'tenant-refresh',
    };

    const tenantAccessToken = this.jwtService.sign(
      accessPayload as object,
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
      } as JwtSignOptions,
    );

    const tenantRefreshToken = this.jwtService.sign(
      refreshPayload as object,
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
      } as JwtSignOptions,
    );

    // Store tenant refresh token in database
    await this.storeTenantRefreshToken(userId, tenantId, tenantRefreshToken);

    return { tenantAccessToken, tenantRefreshToken };
  }

  /**
   * Store identity refresh token in database
   */
  private async storeIdentityRefreshToken(
    userId: string,
    refreshToken: string,
  ) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const expiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') || '14d';
    const expiresAt = new Date(Date.now() + this.parseExpiresIn(expiresIn));

    await this.refreshTokenRepository.create({
      user_id: userId,
      token_hash: tokenHash,
      token_type: TokenType.IDENTITY,
      tenant_id: null,
      expires_at: expiresAt,
    });
  }

  /**
   * Store tenant refresh token in database
   */
  private async storeTenantRefreshToken(
    userId: string,
    tenantId: string,
    refreshToken: string,
  ) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const expiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') || '14d';
    const expiresAt = new Date(Date.now() + this.parseExpiresIn(expiresIn));

    await this.refreshTokenRepository.create({
      user_id: userId,
      token_hash: tokenHash,
      token_type: TokenType.TENANT,
      tenant_id: tenantId,
      expires_at: expiresAt,
    });
  }

  private hashRefreshToken(refreshToken: string): string {
    const refreshHashSecret =
      this.configService.get<string>('jwt.refreshHashSecret') ||
      'fallback-secret';
    return crypto
      .createHmac('sha256', refreshHashSecret)
      .update(refreshToken)
      .digest('hex');
  }

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
   * Refresh access token
   */
  /**
   * Refresh identity tokens
   * Generates new identity access and refresh tokens
   */
  async refreshIdentityTokens(
    userId: string,
    email: string,
    oldRefreshToken: string,
  ): Promise<{ identityAccessToken: string; identityRefreshToken: string }> {
    const oldTokenHash = this.hashRefreshToken(oldRefreshToken);
    const validToken =
      await this.refreshTokenRepository.findIdentityRefreshToken(
        userId,
        oldTokenHash,
      );

    if (!validToken) {
      throw new UnauthorizedException(
        this.i18n.t(AuthI18n.errors.INVALID_REFRESH_TOKEN),
      );
    }

    // Revoke old refresh token
    const revoked = await this.refreshTokenRepository.revokeById(validToken.id);
    if (!revoked) {
      throw new UnauthorizedException(
        this.i18n.t(AuthI18n.errors.FAILED_TO_REVOKE_REFRESH_TOKEN),
      );
    }

    // Get user to check system admin status
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException(
        this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_BY_ID, {
          args: { userId },
        }),
      );
    }

    const platformRole = user.platform_role_key ?? null;

    // Generate new identity tokens
    const tokens = await this.generateIdentityTokens(
      userId,
      email,
      user.is_verified,
      platformRole,
    );

    this.logger.log(`Identity tokens refreshed for user ${userId}`);

    return tokens;
  }

  /**
   * Refresh tenant tokens
   * Generates new tenant access and refresh tokens for the same tenant
   */
  async refreshTenantTokens(
    userId: string,
    email: string,
    tenantId: string,
    oldRefreshToken: string,
  ): Promise<{ tenantAccessToken: string; tenantRefreshToken: string }> {
    const oldTokenHash = this.hashRefreshToken(oldRefreshToken);
    const validToken = await this.refreshTokenRepository.findTenantRefreshToken(
      userId,
      tenantId,
      oldTokenHash,
    );

    if (!validToken) {
      throw new UnauthorizedException(
        this.i18n.t(AuthI18n.errors.INVALID_REFRESH_TOKEN),
      );
    }

    // Revoke old refresh token
    const revoked = await this.refreshTokenRepository.revokeById(validToken.id);
    if (!revoked) {
      throw new UnauthorizedException(
        this.i18n.t(AuthI18n.errors.FAILED_TO_REVOKE_REFRESH_TOKEN),
      );
    }

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
        this.i18n.t(AuthI18n.errors.TENANT_ACCESS_DENIED),
      );
    }

    // Generate new tenant tokens
    const tokens = await this.generateTenantTokens(
      userId,
      email,
      tenantId,
      userTenant.role_key,
    );

    this.logger.log(
      `Tenant tokens refreshed for user ${userId} in tenant ${tenantId}`,
    );

    return tokens;
  }

  /**
   * Logout user (revoke all refresh tokens)
   */
  async logout(
    userId: string,
    identityRefreshToken?: string,
    tenantRefreshToken?: string,
  ) {
    // Revoke all refresh tokens (both identity and tenant)
    if (identityRefreshToken) {
      await this.revokeRefreshToken(userId, identityRefreshToken);
    }
    if (tenantRefreshToken) {
      await this.revokeRefreshToken(userId, tenantRefreshToken);
    }

    this.logger.log(
      `User ${userId} logged out (identity tokens revoked, tenant tokens revoked)`,
    );
    return { message: this.i18n.t(AuthI18n.messages.LOGOUT_SUCCESS) };
  }

  private async revokeRefreshToken(userId: string, refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const validToken =
      await this.refreshTokenRepository.findByTokenHash(tokenHash);

    if (!validToken) {
      this.logger.warn(`Refresh token not found for user ${userId}`);
    }

    if (!validToken) {
      return null;
    }

    const revoked = await this.refreshTokenRepository.revokeById(validToken.id);
    if (!revoked) {
      this.logger.warn(`Failed to revoke refresh token for user ${userId}`);
      return null;
    }
  }

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
        this.i18n.t(AuthI18n.errors.INVALID_VERIFICATION_TOKEN),
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

    return { message: this.i18n.t(AuthI18n.messages.EMAIL_VERIFIED) };
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
        message: this.i18n.t(AuthI18n.messages.PASSWORD_RESET_EMAIL_SENT),
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

    this.emailService.sendPasswordResetEmail(email, resetToken);

    const result = {
      message: this.i18n.t(AuthI18n.messages.PASSWORD_RESET_EMAIL_SENT),
    };

    if (this.configService.get<string>('app.environment') !== 'production') {
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
        this.i18n.t(AuthI18n.errors.INVALID_VERIFICATION_TOKEN),
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

      // Revoke all refresh tokens for this user (force re-login)
      await this.refreshTokenRepository.revokeAllByUserId(reset.userId, {
        client,
      });
    });

    this.logger.log(`Password reset for user ${reset.userId}`);

    return { message: this.i18n.t(AuthI18n.messages.PASSWORD_RESET_SUCCESS) };
  }

  /**
   * Switch to a different tenant
   * User must be authenticated with identity token
   */
  async tenantSwitch(
    { email, userId }: AuthenticatedIdentityUser,
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
          this.i18n.t(AuthI18n.errors.TENANT_ACCESS_DENIED),
        );
      }

      // Generate tenant tokens (access + refresh)
      const { tenantAccessToken, tenantRefreshToken } =
        await this.generateTenantTokens(
          userId,
          email,
          tenantId,
          userTenant.role_key,
        );

      this.logger.log(`User ${email} switched to tenant ${tenantId}`);

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
