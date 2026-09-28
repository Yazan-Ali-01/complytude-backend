import { DatabaseService, type QueryOptions } from '@lib/database';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtSignOptions } from '@nestjs/jwt';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
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
import { v4 as uuidv4 } from 'uuid';
import { EmailVerificationRepository } from '../../repositories/users/email-verification.repository';
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
  RenameSessionDto,
  ResetPasswordDto,
  ResolveInvitationResponseDto,
  SignupDto,
  TenantSwitchResponseDto,
  VerifyEmailDto,
} from './dto';
import type { SessionListResponseDto } from './dto/session-list-response.dto';
import { GeoLocationService } from './services/geo-location.service';
import { SessionInvalidationService } from './services/session-invalidation.service';
import { SessionService } from './services/session.service';
import {
  AuthenticatedIdentityUser,
  IdentityPayload,
  IdentityRefreshPayload,
  TenantPayload,
  TenantRefreshPayload,
} from './strategies';
import type { SsoOAuthProfile } from './strategies/sso-payload.interface';
import { parseUserAgent } from './utils/user-agent.util';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_ROUNDS = 10;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tenantService: TenantService,
    private readonly emailVerificationRepository: EmailVerificationRepository,
    private readonly userRepository: UserRepository,
    private readonly userTenantRepository: UserTenantRepository,
    private readonly databaseService: DatabaseService,
    private readonly invitationsService: InvitationsService,
    private readonly emailService: EmailService,
    private readonly i18n: I18nService,
    private readonly sessionService: SessionService,
    private readonly sessionInvalidationService: SessionInvalidationService,
    private readonly geoLocationService: GeoLocationService,
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

    const { userId, verificationToken } =
      await this.databaseService.transaction(async (client) => {
        // Create user account
        this.logger.log(`Creating user account for ${signupDto.email}`);
        const { id } = await this.userRepository.create(
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

        this.logger.log(
          `Creating email verification record for ${signupDto.email}`,
        );
        const token = await this.createEmailVerificationRecord(id, { client });
        return { userId: id, verificationToken: token };
      });

    // Sent after the commit, so a rollback never leaves a mailed token without its row. A failed
    // send (e.g. SES rejecting the address) must not fail the signup or crash the process.
    this.emailService
      .sendVerificationEmail(signupDto.email, verificationToken)
      .catch((error: unknown) => {
        this.logger.error(
          `Verification email failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

    const result = {
      message: this.i18n.t(AuthI18n.messages.SIGNUP_SUCCESS),
    } as unknown as MessageResponseDto & { verificationToken: string };

    if (this.configService.get<string>('app.environment') !== 'production') {
      (result as unknown as { verificationToken: string }).verificationToken =
        verificationToken;
    }

    return result;
  }

  /**
   * Login user and generate identity token
   * Creates identity session in Redis, embeds sessionId in tokens.
   * Returns user info and list of available tenants.
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
    const user = await this.validateUser(loginDto.email, loginDto.password);
    return this.completeIdentityLogin(user, request);
  }

  /**
   * OAuth2 SSO: find or create user, then issue the same identity session + JWT pair as email login.
   */
  async validateOrCreateSsoUser(
    profile: SsoOAuthProfile,
    request: FastifyRequest,
  ): Promise<{
    identityAccessToken: string;
    identityRefreshToken: string;
  }> {
    if (!profile.email?.trim()) {
      throw new BadRequestException(
        this.i18n.t(AuthI18n.errors.SSO_EMAIL_REQUIRED),
      );
    }

    const user = await this.resolveOrCreateSsoUser(profile);
    // A new account from an unverified provider email exists now (and was sent a verification
    // email), but it gets no session until that email is verified.
    this.assertEmailVerified(user);
    const { identityAccessToken, identityRefreshToken } =
      await this.issueIdentitySessionAndTokens(user, request);
    return { identityAccessToken, identityRefreshToken };
  }

  /**
   * Build absolute URL for browser redirect after OAuth (uses FRONTEND_URL + SSO_*_PATH).
   */
  getSsoFrontendRedirectUrl(
    outcome: 'success' | 'error',
    extra: Record<string, string> = {},
  ): string {
    const base = (
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
    const defaultPath =
      outcome === 'success' ? '/auth/callback' : '/auth/error';
    const pathKey =
      outcome === 'success'
        ? 'sso.frontendSuccessPath'
        : 'sso.frontendErrorPath';
    const path = this.configService.get<string>(pathKey) ?? defaultPath;
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const params = new URLSearchParams({
      ...(outcome === 'success' ? { sso: 'success' } : { sso: 'error' }),
      ...extra,
    });
    return `${base}${normalizedPath}?${params.toString()}`;
  }

  /**
   * Stores a hashed email-verification token for the user and returns the raw token to email.
   */
  private async createEmailVerificationRecord(
    userId: string,
    options: QueryOptions,
  ): Promise<string> {
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto
      .createHash('sha256')
      .update(verificationToken)
      .digest('hex');
    const expiresAt = new Date(
      Date.now() +
        this.parseExpiresIn(
          this.configService.get<string>('email.verificationExpiresIn') || '1d',
        ),
    );
    await this.emailVerificationRepository.createEmailVerification(
      { userId, token: hashedToken, expiresAt },
      options,
    );
    return verificationToken;
  }

  private async resolveOrCreateSsoUser(
    profile: SsoOAuthProfile,
  ): Promise<User> {
    const email = profile.email.trim().toLowerCase();
    const providerCol =
      profile.provider === 'google' ? 'google_id' : 'microsoft_id';

    // 1. Already linked — fast path
    const byProvider = await this.userRepository.findByProviderId(
      providerCol,
      profile.providerSubjectId,
    );
    if (byProvider) return byProvider;

    // 2. Email exists. Link only when the provider verified the email AND the account owner
    //    verified it too (an unverified password account may belong to someone who never owned
    //    the mailbox), never into a platform-admin account, and never over another identity from
    //    the same provider. Anything else is refused: no session for that account.
    const byEmail = await this.userRepository.findByEmailRow(email);
    if (byEmail) {
      const canLink =
        profile.emailVerified &&
        byEmail.is_verified &&
        !byEmail.platform_role_key &&
        !byEmail[providerCol];
      if (!canLink) {
        this.logger.warn(
          `SSO ${profile.provider} sign-in refused for existing user ${byEmail.id}: ` +
            `emailVerified=${profile.emailVerified} accountVerified=${byEmail.is_verified} ` +
            `platformRole=${Boolean(byEmail.platform_role_key)} linkedElsewhere=${Boolean(byEmail[providerCol])}`,
        );
        throw new ConflictException(
          this.i18n.t(AuthI18n.errors.SSO_ACCOUNT_EXISTS),
        );
      }
      try {
        return await this.userRepository.update(byEmail.id, {
          [providerCol]: profile.providerSubjectId,
          updated_at: new Date(),
        });
      } catch (err: unknown) {
        if ((err as { code?: string }).code === '23505') {
          const existing = await this.userRepository.findByProviderId(
            providerCol,
            profile.providerSubjectId,
          );
          if (existing) return existing;
        }
        throw err;
      }
    }

    // 3. Brand new user. The email counts as verified only when the provider says so; otherwise
    //    the user confirms it through the same emailed link as a password signup.
    let created: { user: User; verificationToken: string | null };
    try {
      created = await this.databaseService.transaction(async (client) => {
        const user = await this.userRepository.create(
          {
            email,
            password_hash: null,
            first_name: profile.firstName,
            last_name: profile.lastName,
            is_verified: profile.emailVerified,
            platform_role_key: null,
            [providerCol]: profile.providerSubjectId,
            auth_provider: profile.provider,
          },
          { client },
        );
        const verificationToken = profile.emailVerified
          ? null
          : await this.createEmailVerificationRecord(user.id, { client });
        return { user, verificationToken };
      });
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        const existing = await this.userRepository.findByProviderId(
          providerCol,
          profile.providerSubjectId,
        );
        if (existing) return existing;
      }
      throw err;
    }

    if (created.verificationToken) {
      this.emailService
        .sendVerificationEmail(email, created.verificationToken)
        .catch((error: unknown) => {
          this.logger.error(
            `Failed to send verification email to new SSO user ${created.user.id}`,
            error instanceof Error ? error.stack : String(error),
          );
        });
    }
    return created.user;
  }

  private async issueIdentitySessionAndTokens(
    user: User,
    request: FastifyRequest,
  ): Promise<{ identityAccessToken: string; identityRefreshToken: string }> {
    const platformRole = user.platform_role_key ?? null;
    const userAgent = request.headers['user-agent'];
    const ipAddress = request.ip ?? 'unknown';
    const deviceInfo = parseUserAgent(userAgent);

    const identitySessionId = uuidv4();
    await this.sessionService.enforceSessionLimit(user.id, identitySessionId);
    await this.sessionService.createIdentitySession(identitySessionId, {
      userId: user.id,
      email: user.email,
      platformRole,
      isVerified: user.is_verified,
      deviceInfo,
      ipAddress,
      geoLocation: null,
      sessionName: null,
      activeTenantSessionIds: [],
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    });

    // Fire-and-forget: enrich session with geo when lookup succeeds (never blocks)
    void this.geoLocationService
      .lookup(ipAddress)
      .then((geo) =>
        geo
          ? this.sessionService.updateIdentitySessionGeo(
              identitySessionId,
              user.id,
              geo,
            )
          : undefined,
      )
      .catch((err) =>
        this.logger.warn(
          `Geo lookup failed for session ${identitySessionId}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return this.generateIdentityTokens(
      user.id,
      user.email,
      user.is_verified,
      platformRole,
      identitySessionId,
    );
  }

  private async completeIdentityLogin(
    user: User,
    request: FastifyRequest,
  ): Promise<
    LoginResponseDto & {
      identityAccessToken: string;
      identityRefreshToken: string;
    }
  > {
    const { identityAccessToken, identityRefreshToken } =
      await this.issueIdentitySessionAndTokens(user, request);

    // Get user's active tenants
    const userTenants = await this.userTenantRepository.getActiveUserTenants(
      user.id,
      { isAuthflow: true },
    );

    // Map user tenants to response format
    const tenantsWithDetails = userTenants.map((ut) => ({
      tenantId: ut.tenant_id,
      tenantName: ut.tenant_name ?? '',
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
        'auth_provider',
      ],
    });
    if (!user) {
      this.logger.warn(`Login failed: user not found for email`);
      throw new UnauthorizedException(
        this.i18n.t(AuthI18n.errors.INVALID_CREDENTIALS),
      );
    }

    if (user.password_hash === null) {
      throw new UnauthorizedException(
        this.i18n.t(AuthI18n.errors.SSO_ACCOUNT_USE_PASSWORD_PROVIDER, {
          args: {
            provider: this.authProviderLabel(user.auth_provider),
          },
        }),
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

    // Checked after the password, so only the password holder learns the account is unverified
    this.assertEmailVerified(user);

    return user;
  }

  /**
   * No identity session for an unverified email: until the owner proves the mailbox, the account
   * may belong to someone who only typed that address (password signup) or asserted it (SSO).
   */
  private assertEmailVerified(user: User): void {
    if (!user.is_verified) {
      this.logger.warn(`Login refused: email not verified for user ${user.id}`);
      throw new UnauthorizedException(
        this.i18n.t(AuthI18n.errors.EMAIL_NOT_VERIFIED),
      );
    }
  }

  private authProviderLabel(provider: User['auth_provider']): string {
    switch (provider) {
      case 'google':
        return 'Google';
      case 'microsoft':
        return 'Microsoft';
      default:
        return 'email';
    }
  }

  /**
   * Generate identity tokens (access + refresh)
   * Used after login, before tenant selection.
   * SessionId links to Redis identity-session for revocation.
   */
  generateIdentityTokens(
    userId: string,
    email: string,
    isVerified: boolean,
    platformRole: string | null,
    sessionId: string,
  ): { identityAccessToken: string; identityRefreshToken: string } {
    const accessPayload: IdentityPayload = {
      sub: userId,
      email,
      isVerified,
      platformRole,
      sessionId,
      type: 'identity',
    };

    const refreshPayload: IdentityRefreshPayload = {
      sub: userId,
      email,
      sessionId,
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

    return { identityAccessToken, identityRefreshToken };
  }

  /**
   * Generate tenant tokens (access + refresh)
   * Used after tenant selection.
   * SessionId links to Redis tenant-session for revocation.
   */
  generateTenantTokens(
    userId: string,
    email: string,
    tenantId: string,
    role: string,
    sessionId: string,
  ): { tenantAccessToken: string; tenantRefreshToken: string } {
    const accessPayload: TenantPayload = {
      sub: userId,
      email,
      tenantId,
      role,
      sessionId,
      type: 'tenant-access',
    };

    const refreshPayload: TenantRefreshPayload = {
      sub: userId,
      email,
      tenantId,
      sessionId,
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

    return { tenantAccessToken, tenantRefreshToken };
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
   * Refresh identity access token.
   * Validates session exists in Redis. Reissues access token only (no refresh rotation).
   *
   * SECURITY NOTE: Refresh token rotation was intentionally removed in favour of
   * Redis session-based revocation. A stolen refresh token can be used until the
   * session is deleted or expires. Mitigations: SESSION_STRICT_MODE, idle timeout,
   * and absolute TTL. If token-theft detection is needed later, consider
   * reuse-detection (family tracking) as a future enhancement.
   */
  async refreshIdentityTokens(
    userId: string,
    email: string,
    sessionId: string,
  ): Promise<{ identityAccessToken: string }> {
    if (!sessionId) {
      throw new UnauthorizedException(
        this.i18n.t(AuthI18n.errors.SESSION_EXPIRED_OR_INVALID),
      );
    }
    const exists = await this.sessionService.identitySessionExists(sessionId);
    if (!exists) {
      throw new UnauthorizedException(
        this.i18n.t(AuthI18n.errors.SESSION_EXPIRED_OR_INVALID),
      );
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException(
        this.i18n.t(UsersI18n.errors.USER_NOT_FOUND_BY_ID, {
          args: { userId },
        }),
      );
    }

    const platformRole = user.platform_role_key ?? null;
    const { identityAccessToken } = this.generateIdentityTokens(
      userId,
      email,
      user.is_verified,
      platformRole,
      sessionId,
    );

    this.logger.log(`Identity tokens refreshed for user ${userId}`);

    return { identityAccessToken };
  }

  /**
   * Refresh tenant access token.
   * Validates session exists in Redis. Reissues access token only (no refresh rotation).
   */
  async refreshTenantTokens(
    userId: string,
    email: string,
    tenantId: string,
    sessionId: string,
  ): Promise<{ tenantAccessToken: string }> {
    if (!sessionId) {
      throw new UnauthorizedException(
        this.i18n.t(AuthI18n.errors.SESSION_EXPIRED_OR_INVALID),
      );
    }
    const exists = await this.sessionService.tenantSessionExists(sessionId);
    if (!exists) {
      throw new UnauthorizedException(
        this.i18n.t(AuthI18n.errors.SESSION_EXPIRED_OR_INVALID),
      );
    }

    const userTenant = await this.databaseService.transaction(async (client) =>
      this.userTenantRepository.getUserInTenant(userId, tenantId, {
        client,
        isAuthflow: true,
      }),
    );

    if (!userTenant || !userTenant.is_active) {
      throw new UnauthorizedException(
        this.i18n.t(AuthI18n.errors.TENANT_ACCESS_DENIED),
      );
    }

    const { tenantAccessToken } = this.generateTenantTokens(
      userId,
      email,
      tenantId,
      userTenant.role_key,
      sessionId,
    );

    this.logger.log(
      `Tenant tokens refreshed for user ${userId} in tenant ${tenantId}`,
    );

    return { tenantAccessToken };
  }

  /**
   * Logout user — delete session(s) from Redis.
   * Identity session cascade-deletes linked tenant sessions.
   */
  async logout(
    userId: string,
    identitySessionId?: string,
    tenantSessionId?: string,
    tenantId?: string,
  ) {
    if (identitySessionId) {
      await this.sessionService.deleteIdentitySession(
        identitySessionId,
        userId,
      );
    } else if (tenantSessionId && tenantId) {
      await this.sessionService.deleteTenantSession(
        tenantSessionId,
        userId,
        tenantId,
      );
    }

    this.logger.log(`User ${userId} logged out`);
    return { message: this.i18n.t(AuthI18n.messages.LOGOUT_SUCCESS) };
  }

  /**
   * List sessions for current tenant only.
   * Delegates to SessionService.
   */
  async getSessionsForCurrentTenant(
    userId: string,
    tenantId: string,
    currentIdentitySessionId?: string,
    currentTenantSessionId?: string,
  ): Promise<SessionListResponseDto> {
    return this.sessionService.getUserSessionsForTenant(
      userId,
      tenantId,
      currentIdentitySessionId,
      currentTenantSessionId,
    );
  }

  /**
   * List all sessions across all tenants.
   * Delegates to SessionService.
   */
  async getAllSessions(
    userId: string,
    currentIdentitySessionId?: string,
    currentTenantSessionId?: string,
  ): Promise<SessionListResponseDto> {
    return this.sessionService.getUserAllSessions(
      userId,
      currentIdentitySessionId,
      currentTenantSessionId,
    );
  }

  /**
   * Delete a specific session (identity or tenant).
   * Identity session deletion cascades to all linked tenant sessions.
   */
  async deleteSession(
    userId: string,
    sessionId: string,
  ): Promise<{ message: string }> {
    const identitySession =
      await this.sessionService.findIdentitySessionById(sessionId);
    if (identitySession && identitySession.userId === userId) {
      await this.sessionService.deleteIdentitySession(sessionId, userId);
      this.logger.log(
        `Deleted identity session ${sessionId} for user ${userId}`,
      );
      return { message: this.i18n.t(AuthI18n.messages.LOGOUT_SUCCESS) };
    }

    const tenantSession =
      await this.sessionService.findTenantSessionById(sessionId);
    if (tenantSession && tenantSession.userId === userId) {
      await this.sessionService.deleteTenantSession(
        sessionId,
        userId,
        tenantSession.tenantId,
      );
      this.logger.log(
        `Deleted tenant session ${sessionId} for user ${userId} in tenant ${tenantSession.tenantId}`,
      );
      return { message: this.i18n.t(AuthI18n.messages.LOGOUT_SUCCESS) };
    }

    throw new NotFoundException(this.i18n.t(AuthI18n.errors.SESSION_NOT_FOUND));
  }

  /**
   * Logout all sessions for current tenant (across all devices).
   */
  async logoutCurrentTenant(
    userId: string,
    tenantId: string,
  ): Promise<{ message: string }> {
    await this.sessionInvalidationService.invalidateTenantSessions(
      userId,
      tenantId,
    );
    this.logger.log(
      `Logged out all tenant sessions for user ${userId} in tenant ${tenantId}`,
    );
    return { message: this.i18n.t(AuthI18n.messages.LOGOUT_SUCCESS) };
  }

  /**
   * Logout all sessions (all tenants, all devices).
   */
  async logoutAll(userId: string): Promise<{ message: string }> {
    await this.sessionInvalidationService.invalidateAllUserSessions(userId);
    this.logger.log(`Logged out all sessions for user ${userId}`);
    return { message: this.i18n.t(AuthI18n.messages.LOGOUT_SUCCESS) };
  }

  /**
   * Rename an identity session (update sessionName).
   */
  async renameSession(
    userId: string,
    sessionId: string,
    dto: RenameSessionDto,
  ): Promise<{ message: string }> {
    const updated = await this.sessionService.updateIdentitySessionName(
      sessionId,
      userId,
      dto.sessionName ?? null,
    );
    if (!updated) {
      throw new NotFoundException(
        this.i18n.t(AuthI18n.errors.SESSION_NOT_FOUND),
      );
    }
    this.logger.log(`Renamed session ${sessionId} for user ${userId}`);
    return { message: this.i18n.t(AuthI18n.messages.SESSION_RENAMED) };
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

    // A failed send must not reveal whether the account exists, fail the request, or crash the process
    this.emailService
      .sendPasswordResetEmail(email, resetToken)
      .catch((error: unknown) => {
        this.logger.error(
          `Password reset email failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });

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
    });

    await this.sessionInvalidationService.invalidateAllUserSessions(
      reset.userId,
    );

    this.logger.log(`Password reset for user ${reset.userId}`);

    return { message: this.i18n.t(AuthI18n.messages.PASSWORD_RESET_SUCCESS) };
  }

  /**
   * Switch to a different tenant
   * User must be authenticated with identity token.
   * Validates identity session exists, creates tenant session in Redis.
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
    if (identitySessionId) {
      const exists =
        await this.sessionService.identitySessionExists(identitySessionId);
      if (!exists) {
        throw new UnauthorizedException(
          this.i18n.t(AuthI18n.errors.SESSION_EXPIRED_OR_INVALID),
        );
      }
    }

    return this.databaseService.transaction(async (client) => {
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

      const tenantSessionId = uuidv4();
      const now = new Date().toISOString();
      await this.sessionService.createTenantSession(
        tenantSessionId,
        {
          userId,
          tenantId,
          role: userTenant.role_key,
          identitySessionId: identitySessionId || '',
          createdAt: now,
          lastActivityAt: now,
        },
        identitySessionId || '',
      );

      const { tenantAccessToken, tenantRefreshToken } =
        this.generateTenantTokens(
          userId,
          email,
          tenantId,
          userTenant.role_key,
          tenantSessionId,
        );

      this.logger.log(`User ${email} switched to tenant ${tenantId}`);

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
          name: userTenant.tenant_name ?? '',
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
    token: string,
    userId: string,
    email: string,
  ): Promise<MessageResponseDto> {
    return this.invitationsService.acceptInvitation(
      invitationId,
      token,
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
