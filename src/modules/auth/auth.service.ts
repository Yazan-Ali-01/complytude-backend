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
import { randomUUID } from 'crypto';
import { FastifyReply } from 'fastify';
import { I18n, I18nService } from 'nestjs-i18n';
import {
  ACCESS_TOKEN_COOKIE_NAME,
  COOKIE_PATH,
  COOKIE_SAME_SITE,
  REFRESH_TOKEN_COOKIE_NAME,
} from 'src/common/swagger/common';
import { DatabaseService } from 'src/database/database.service';
import { User } from 'src/modules/users/entities/user.entity';
import { RefreshToken } from 'src/repositories/users/interfaces/refresh-token.interfaces';
import { I18nKeys } from '../../common/constants/i18n-keys';
import { EmailVerificationRepository } from '../../repositories/users/email-verification.repository';
import { RefreshTokenRepository } from '../../repositories/users/refresh-token.repository';
import { UserTenantRepository } from '../../repositories/users/user-tenant.repository';
import { UserRepository } from '../../repositories/users/user.repository';
import { TenantFeaturesDto } from '../tenants/dto/create-tenant.dto';
import { Tenant } from '../tenants/entities/tenant.entity';
import { TenantService } from '../tenants/tenant.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtPayload } from './strategies/jwt.strategy';

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
    @I18n() private readonly i18n: I18nService,
  ) {}

  /**
   * Set HTTP-only auth cookies on the response
   */
  setAuthCookies(
    reply: FastifyReply,
    accessToken: string,
    refreshToken: string,
  ): void {
    const isProduction =
      this.configService.get<string>('app.environment') === 'production';

    const accessExpiresIn =
      this.configService.get<string>('jwt.accessExpiresIn') || '15m';
    const refreshExpiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') || '14d';

    // Set access token cookie
    reply.setCookie(ACCESS_TOKEN_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: COOKIE_SAME_SITE,
      path: COOKIE_PATH,
      maxAge: Math.floor(this.parseExpiresIn(accessExpiresIn) / 1000), // Convert ms to seconds
    });

    // Set refresh token cookie
    reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: COOKIE_SAME_SITE,
      path: COOKIE_PATH,
      maxAge: Math.floor(this.parseExpiresIn(refreshExpiresIn) / 1000), // Convert ms to seconds
    });
  }

  /**
   * Clear auth cookies on logout
   */
  clearAuthCookies(reply: FastifyReply): void {
    const isProduction =
      this.configService.get<string>('app.environment') === 'production';

    reply.clearCookie(ACCESS_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: isProduction,
      sameSite: COOKIE_SAME_SITE,
      path: COOKIE_PATH,
    });

    reply.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: isProduction,
      sameSite: COOKIE_SAME_SITE,
      path: COOKIE_PATH,
    });
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
  async signup(signupDto: SignupDto) {
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

    const userId = randomUUID();

    return await this.databaseService.transaction(async (client) => {
      // Set is_auth_flow flag for this transaction to allow tenant creation
      await client.query("SET LOCAL app.is_auth_flow = 'true'");

      // Create user account
      this.logger.log(`Creating user account for ${signupDto.email}`);
      await this.userRepository.create(
        {
          id: userId,
          email: signupDto.email,
          password_hash: passwordHash,
          first_name: signupDto.firstName ?? null,
          last_name: signupDto.lastName ?? null,
          is_verified: false,
          is_system_admin: false,
        },
        { client },
      );

      // Create tenant with default settings
      this.logger.log(`Creating tenant for ${signupDto.email}`);
      const tenant: Tenant = await this.tenantService.createTenant(
        {
          plan: 'early_access',
          features: new TenantFeaturesDto(),
        },
        { client },
      );

      // Link user to the new tenant as admin
      this.logger.log(`Linking user to tenant for ${signupDto.email}`);
      await this.userTenantRepository.linkUserToTenant(
        {
          userId,
          tenantId: tenant.id,
          role: 'admin', // User is admin of their own tenant
          isActive: true,
        },
        { client },
      );

      // Create email verification record
      const verificationToken = randomUUID();
      const verificationId = randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      this.logger.log(
        `Creating email verification record for ${signupDto.email}`,
      );
      await this.emailVerificationRepository.createEmailVerification(
        {
          id: verificationId,
          userId,
          token: verificationToken,
          expiresAt,
        },
        { client },
      );

      // TODO: Hook in actual email sending here
      this.logger.log(
        `Verification token for ${signupDto.email}: ${verificationToken}`,
      );

      return {
        message: this.i18n.t(I18nKeys.SIGNUP_SUCCESS),
        userId,
        tenantId: tenant.id,
        verificationToken, // Expose only for development/testing; remove in prod
      };
    });
  }

  /**
   * Login user and return JWT tokens
   */
  async login(loginDto: LoginDto) {
    // Validate user credentials
    const user = await this.validateUser(loginDto.email, loginDto.password);

    // Get user's active tenants
    const tenants = await this.userTenantRepository.getActiveUserTenants(
      user.id,
      undefined,
      true,
    );
    if (tenants.length === 0) {
      throw new UnauthorizedException(this.i18n.t(I18nKeys.NO_ACTIVE_TENANTS));
    }

    // If tenantId specified, use that; otherwise use first tenant
    let selectedTenant;
    if (loginDto.tenantId) {
      const found = tenants.find((t) => t.tenant_id === loginDto.tenantId);
      if (!found) {
        throw new UnauthorizedException(
          this.i18n.t(I18nKeys.TENANT_ACCESS_DENIED),
        );
      }
      selectedTenant = found;
    } else {
      selectedTenant = tenants[0];
    }

    // Generate tokens (includes isSystemAdmin from user object)
    const tokens = await this.generateTokens(
      user.id,
      user.email,
      selectedTenant.tenant_id,
      selectedTenant.role,
      user.is_system_admin || false,
    );

    this.logger.log(
      `User ${user.email} logged in to tenant ${selectedTenant.tenant_id}`,
    );

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        isVerified: user.is_verified,
      },
      currentTenant: {
        tenantId: selectedTenant.tenant_id,
        role: selectedTenant.role,
      },
      availableTenants: tenants.map((t) => ({
        tenantId: t.tenant_id,
        role: t.role,
      })),
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
   * Generate access and refresh tokens
   */
  async generateTokens(
    userId: string,
    email: string,
    tenantId: string,
    role: string,
    isSystemAdmin: boolean = false,
  ) {
    const accessPayload: JwtPayload = {
      sub: userId,
      email,
      tenantId,
      role,
      isSystemAdmin,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: userId,
      email,
      tenantId,
      role,
      isSystemAdmin,
      type: 'refresh',
    };

    const accessToken = this.jwtService.sign(
      accessPayload as any,
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiresIn'),
      } as any,
    );

    const refreshToken = this.jwtService.sign(
      refreshPayload as any,
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
      } as any,
    );

    // Store refresh token in database
    await this.storeRefreshToken(userId, refreshToken);

    return { accessToken, refreshToken };
  }

  /**
   * Store refresh token in database
   */
  private async storeRefreshToken(userId: string, refreshToken: string) {
    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') || '14d';
    const expiresAt = new Date(Date.now() + this.parseExpiresIn(expiresIn));

    await this.refreshTokenRepository.create({
      id: randomUUID(),
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });
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
  async refreshTokens(userId: string, email: string, oldRefreshToken: string) {
    // Verify refresh token exists and is not revoked
    const activeTokens =
      await this.refreshTokenRepository.findActiveByUserId(userId);

    if (activeTokens.length === 0) {
      throw new UnauthorizedException(
        this.i18n.t(I18nKeys.INVALID_REFRESH_TOKEN),
      );
    }

    // Find matching token
    let validToken: RefreshToken | null = null;
    for (const token of activeTokens) {
      const isValid = await bcrypt.compare(oldRefreshToken, token.tokenHash);
      if (isValid) {
        validToken = token;
        break;
      }
    }

    if (!validToken) {
      throw new UnauthorizedException(
        this.i18n.t(I18nKeys.INVALID_REFRESH_TOKEN),
      );
    }

    // Revoke old refresh token
    const revoked = await this.refreshTokenRepository.revokeById(validToken.id);
    if (!revoked) {
      throw new UnauthorizedException('Failed to revoke refresh token');
    }

    // Get user's current tenant info and system admin status
    const [user, activeTenants] = await Promise.all([
      this.userRepository.findById(userId),
      this.userTenantRepository.getActiveUserTenants(userId, undefined, true),
    ]);

    if (!user || activeTenants.length === 0) {
      throw new UnauthorizedException(this.i18n.t(I18nKeys.NO_ACTIVE_TENANTS));
    }

    const { tenant_id: tenantId, role } = activeTenants[0];

    // Generate new tokens
    const tokens = await this.generateTokens(
      userId,
      email,
      tenantId,
      role,
      user.is_system_admin || false,
    );

    this.logger.log(`Tokens refreshed for user ${userId}`);

    return tokens;
  }

  /**
   * Logout user (revoke refresh token)
   */
  async logout(userId: string, refreshToken: string) {
    // Find and revoke the refresh token
    const activeTokens =
      await this.refreshTokenRepository.findActiveByUserId(userId);

    for (const token of activeTokens) {
      const isValid = await bcrypt.compare(refreshToken, token.tokenHash);
      if (isValid) {
        const revoked = await this.refreshTokenRepository.revokeById(token.id);
        if (revoked) {
          this.logger.log(`User ${userId} logged out`);
          return { message: this.i18n.t(I18nKeys.LOGOUT_SUCCESS) };
        }
      }
    }

    throw new BadRequestException(this.i18n.t(I18nKeys.INVALID_REFRESH_TOKEN));
  }

  /**
   * Verify email address
   */
  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const verification = await this.emailVerificationRepository.findByToken(
      verifyEmailDto.token,
    );

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
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.userRepository.findOne({
      filters: {
        email: forgotPasswordDto.email,
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
    const resetToken = randomUUID();
    const resetId = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.userRepository.createPasswordReset({
      id: resetId,
      userId,
      token: resetToken,
      expiresAt,
    });

    // TODO: Send password reset email
    this.logger.log(
      `Password reset token for ${forgotPasswordDto.email}: ${resetToken}`,
    );

    return {
      message: this.i18n.t(I18nKeys.PASSWORD_RESET_EMAIL_SENT),
      resetToken, // Remove in production
    };
  }

  /**
   * Reset password using token
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const reset = await this.userRepository.findPasswordResetByToken(
      resetPasswordDto.token,
    );

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

      // Revoke all refresh tokens for this user (force re-login)
      await this.refreshTokenRepository.revokeAllByUserId(reset.userId, {
        client,
      });
    });

    this.logger.log(`Password reset for user ${reset.userId}`);

    return { message: this.i18n.t(I18nKeys.PASSWORD_RESET_SUCCESS) };
  }
}
