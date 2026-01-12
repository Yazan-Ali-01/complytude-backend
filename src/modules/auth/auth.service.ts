/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { I18nService, I18n } from 'nestjs-i18n';
import { DatabaseService } from '../../database/database.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { TenantService } from '../tenant/tenant.service';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantFeaturesDto } from '../tenant/dto/create-tenant.dto';
import { I18nKeys } from '../../common/constants/i18n-keys';

interface TenantRow {
  tenant_id: string;
  role: string;
  schema_name: string;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  is_verified: boolean;
  is_system_admin: boolean;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_ROUNDS = 12;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tenantService: TenantService,
    @I18n() private readonly i18n: I18nService,
  ) {}

  /**
   * Registers a new user and creates their first tenant.
   *
   * @remarks
   * - The creation of the tenant and corresponding tenant schema is fully handled within {@link TenantService}.
   *   This encapsulates all tenant and multi-tenant schema provisioning logic.
   * - Linking the user to the tenant (the `user_tenants` relation) is performed in this method.
   *
   * @param signupDto - User and initial tenant information
   * @returns An object containing a success message, userId, tenant_id, and an email verification token (remove in production)
   * @throws {ConflictException} if the email is already registered
   */
  async signup(signupDto: SignupDto) {
    // Check if user already exists
    const existingUser = await this.databaseService.query(
      'SELECT id FROM public.users WHERE email = $1',
      [signupDto.email],
    );

    if (existingUser.rows.length > 0) {
      throw new ConflictException(
        this.i18n.t(I18nKeys.EMAIL_ALREADY_REGISTERED),
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(
      signupDto.password,
      this.BCRYPT_ROUNDS,
    );

    const userId = `user_${randomUUID()}`;

    return await this.databaseService.transaction(async (client) => {
      // Create user account
      await client.query(
        `INSERT INTO public.users (id, email, password_hash, first_name, last_name, is_verified)
         VALUES ($1, $2, $3, $4, $5, false)`,
        [
          userId,
          signupDto.email,
          passwordHash,
          signupDto.firstName,
          signupDto.lastName,
        ],
      );

      // Create tenant and schema via TenantService (all multi-tenant setup is encapsulated there)
      const tenant: Tenant = await this.tenantService.createTenant(
        {
          email: signupDto.email,
          role: 'admin',
          plan: 'early_access',
          features: new TenantFeaturesDto(),
        },
        userId,
      );

      // Link user to the new tenant
      await client.query(
        `INSERT INTO public.user_tenants (user_id, tenant_id, role, is_active)
         VALUES ($1, $2, $3, true)`,
        [userId, tenant.tenant_id, tenant.role],
      );

      // Create email verification record
      const verificationToken = randomUUID();
      const verificationId = `verify_${randomUUID()}`;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      await client.query(
        `INSERT INTO public.email_verifications (id, user_id, token, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [verificationId, userId, verificationToken, expiresAt],
      );

      // TODO: Hook in actual email sending here
      this.logger.log(
        `Verification token for ${signupDto.email}: ${verificationToken}`,
      );

      return {
        message: this.i18n.t(I18nKeys.SIGNUP_SUCCESS),
        userId,
        tenant_id: tenant.tenant_id,
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

    // Get user's tenants
    const tenantsResult = await this.databaseService.query<TenantRow>(
      `SELECT ut.tenant_id, ut.role, t.schema_name 
       FROM public.user_tenants ut
       JOIN public.tenants t ON ut.tenant_id = t.tenant_id
       WHERE ut.user_id = $1 AND ut.is_active = true`,
      [user.id],
    );

    if (tenantsResult.rows.length === 0) {
      throw new UnauthorizedException(this.i18n.t(I18nKeys.NO_ACTIVE_TENANTS));
    }

    // If tenantId specified, use that; otherwise use first tenant
    let selectedTenant: TenantRow;
    if (loginDto.tenantId) {
      const found = tenantsResult.rows.find(
        (t) => t.tenant_id === loginDto.tenantId,
      );
      if (!found) {
        throw new UnauthorizedException(
          this.i18n.t(I18nKeys.TENANT_ACCESS_DENIED),
        );
      }
      selectedTenant = found;
    } else {
      selectedTenant = tenantsResult.rows[0];
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
        schemaName: selectedTenant.schema_name,
      },
      availableTenants: tenantsResult.rows.map((t) => ({
        tenantId: t.tenant_id,
        role: t.role,
      })),
    };
  }

  /**
   * Validate user credentials
   */
  async validateUser(email: string, password: string): Promise<UserRow> {
    const result = await this.databaseService.query<UserRow>(
      'SELECT * FROM public.users WHERE email = $1',
      [email],
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedException(
        this.i18n.t(I18nKeys.INVALID_CREDENTIALS),
      );
    }

    const user = result.rows[0];

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
    const tokenId = `refresh_${randomUUID()}`;
    const expiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') || '14d';
    const expiresAt = new Date(Date.now() + this.parseExpiresIn(expiresIn));

    await this.databaseService.query(
      `INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [tokenId, userId, tokenHash, expiresAt],
    );
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
    const result = await this.databaseService.query(
      `SELECT * FROM public.refresh_tokens 
       WHERE user_id = $1 AND expires_at > NOW() AND revoked_at IS NULL`,
      [userId],
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedException(
        this.i18n.t(I18nKeys.INVALID_REFRESH_TOKEN),
      );
    }

    // Find matching token
    let validToken: any = null;
    for (const token of result.rows) {
      const isValid = await bcrypt.compare(oldRefreshToken, token.token_hash);
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
    await this.databaseService.query(
      'UPDATE public.refresh_tokens SET revoked_at = NOW() WHERE id = $1',
      [validToken.id],
    );

    // Get user's current tenant info and system admin status
    const userResult = await this.databaseService.query(
      `SELECT u.is_system_admin, ut.tenant_id, ut.role 
       FROM public.users u
       JOIN public.user_tenants ut ON u.id = ut.user_id
       WHERE u.id = $1 AND ut.is_active = true LIMIT 1`,
      [userId],
    );

    if (userResult.rows.length === 0) {
      throw new UnauthorizedException(this.i18n.t(I18nKeys.NO_ACTIVE_TENANTS));
    }

    const {
      tenant_id: tenantId,
      role,
      is_system_admin: isSystemAdmin,
    } = userResult.rows[0];

    // Generate new tokens
    const tokens = await this.generateTokens(
      userId,
      email,
      tenantId,
      role,
      isSystemAdmin || false,
    );

    this.logger.log(`Tokens refreshed for user ${userId}`);

    return tokens;
  }

  /**
   * Logout user (revoke refresh token)
   */
  async logout(userId: string, refreshToken: string) {
    // Find and revoke the refresh token
    const result = await this.databaseService.query(
      'SELECT * FROM public.refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    );

    for (const token of result.rows) {
      const isValid = await bcrypt.compare(refreshToken, token.token_hash);
      if (isValid) {
        await this.databaseService.query(
          'UPDATE public.refresh_tokens SET revoked_at = NOW() WHERE id = $1',
          [token.id],
        );
        this.logger.log(`User ${userId} logged out`);
        return { message: this.i18n.t(I18nKeys.LOGOUT_SUCCESS) };
      }
    }

    throw new BadRequestException(this.i18n.t(I18nKeys.INVALID_REFRESH_TOKEN));
  }

  /**
   * Verify email address
   */
  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const result = await this.databaseService.query(
      `SELECT * FROM public.email_verifications 
       WHERE token = $1 AND expires_at > NOW() AND verified_at IS NULL`,
      [verifyEmailDto.token],
    );

    if (result.rows.length === 0) {
      throw new BadRequestException(
        this.i18n.t(I18nKeys.INVALID_VERIFICATION_TOKEN),
      );
    }

    const verification = result.rows[0];

    await this.databaseService.transaction(async (client) => {
      // Mark email as verified
      await client.query(
        'UPDATE public.users SET is_verified = true WHERE id = $1',
        [verification.user_id],
      );

      // Mark verification as completed
      await client.query(
        'UPDATE public.email_verifications SET verified_at = NOW() WHERE id = $1',
        [verification.id],
      );
    });

    this.logger.log(`Email verified for user ${verification.user_id}`);

    return { message: this.i18n.t(I18nKeys.EMAIL_VERIFIED) };
  }

  /**
   * Request password reset
   */
  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const result = await this.databaseService.query(
      'SELECT id FROM public.users WHERE email = $1',
      [forgotPasswordDto.email],
    );

    if (result.rows.length === 0) {
      // Don't reveal if email exists
      return {
        message: this.i18n.t(I18nKeys.PASSWORD_RESET_EMAIL_SENT),
      };
    }

    const userId = result.rows[0].id;
    const resetToken = randomUUID();
    const resetId = `reset_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.databaseService.query(
      `INSERT INTO public.password_resets (id, user_id, token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [resetId, userId, resetToken, expiresAt],
    );

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
    const result = await this.databaseService.query(
      `SELECT * FROM public.password_resets 
       WHERE token = $1 AND expires_at > NOW() AND used_at IS NULL`,
      [resetPasswordDto.token],
    );

    if (result.rows.length === 0) {
      throw new BadRequestException(
        this.i18n.t(I18nKeys.INVALID_VERIFICATION_TOKEN),
      );
    }

    const reset = result.rows[0];

    // Hash new password
    const passwordHash = await bcrypt.hash(
      resetPasswordDto.newPassword,
      this.BCRYPT_ROUNDS,
    );

    await this.databaseService.transaction(async (client) => {
      // Update password
      await client.query(
        'UPDATE public.users SET password_hash = $1 WHERE id = $2',
        [passwordHash, reset.user_id],
      );

      // Mark token as used
      await client.query(
        'UPDATE public.password_resets SET used_at = NOW() WHERE id = $1',
        [reset.id],
      );

      // Revoke all refresh tokens for this user (force re-login)
      await client.query(
        'UPDATE public.refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [reset.user_id],
      );
    });

    this.logger.log(`Password reset for user ${reset.user_id}`);

    return { message: this.i18n.t(I18nKeys.PASSWORD_RESET_SUCCESS) };
  }
}
