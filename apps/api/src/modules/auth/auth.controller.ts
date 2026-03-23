import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { MessageResponseDto } from 'src/common/dto/message-response.dto';
import {
  ApiAuthenticatedResponses,
  ApiConflictError,
  ApiForbiddenError,
  ApiNotFoundError,
  ApiPublicResponses,
  ApiValidationError,
  SwaggerCookieAuth,
} from 'src/common/swagger';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuthService } from './auth.service';
import {
  AuthOptions,
  AuthRefreshOptions,
} from './decorators/auth-options.decorator';
import {
  CurrentUserIdentity,
  CurrentUserIdentityRefresh,
  CurrentUserTenantRefresh,
} from './decorators/current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { InvitationIdParamDto } from './dto/invitation-id-param.dto';
import { InvitationListResponseDto } from './dto/invitation-list-response.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResolveInvitationResponseDto } from './dto/resolve-invitation-response.dto';
import { SignupDto } from './dto/signup.dto';
import { TenantSwitchResponseDto } from './dto/tenant-switch-response.dto';
import { TenantSwitchDto } from './dto/tenant-switch.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { JwtAuthRefreshGuard } from './guards';
import type {
  AuthenticatedIdentityRefreshUser,
  AuthenticatedIdentityUser,
  AuthenticatedTenantRefreshUser,
} from './strategies';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 1. POST /auth/signup
   * Register new user account without creating a tenant
   */
  @Post('signup')
  @Audit('AUTH_SIGNUP')
  @ApiOperation({
    summary: 'Register a new user account',
    description:
      'Create a new user account. Email verification will be sent. User does not create a tenant during signup.',
  })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully. Verification email sent.',
    type: MessageResponseDto,
  })
  @ApiValidationError()
  @ApiConflictError('Email already registered')
  @ApiPublicResponses()
  signup(@Body() signupDto: SignupDto): Promise<MessageResponseDto> {
    return this.authService.signup(signupDto);
  }

  /**
   * 2. POST /auth/verify-email
   * Verify email address using token
   */
  @Post('verify-email')
  @Audit('AUTH_EMAIL_VERIFIED')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email address',
    description: 'Verify user email address using the token sent via email',
  })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired verification token',
  })
  @ApiPublicResponses()
  verifyEmail(
    @Body() verifyEmailDto: VerifyEmailDto,
  ): Promise<MessageResponseDto> {
    return this.authService.verifyEmail(verifyEmailDto);
  }

  /**
   * 3. POST /auth/login
   * Login and receive identity tokens for tenant selection or system admin operations
   */
  @Post('login')
  @Audit('AUTH_LOGIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login to user account',
    description:
      'Authenticate user and return identity tokens (access + refresh). Regular users must then select a tenant. System admins can use identity token for platform operations.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Login successful. Identity tokens set. Returns user info and list of tenants.',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or email not verified',
  })
  @ApiValidationError()
  @ApiPublicResponses()
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponseDto> {
    const { identityAccessToken, identityRefreshToken, ...loginResponse } =
      await this.authService.login(loginDto);

    // Clear all auth cookies (in case the user somehow didn't logout before logging in again)
    this.authService.clearAllAuthCookies(reply);

    // Set identity tokens
    this.authService.setIdentityTokens(
      reply,
      identityAccessToken,
      identityRefreshToken,
    );
    return new LoginResponseDto(loginResponse);
  }

  /**
   * 4. POST /auth/tenant-switch
   * Select active tenant and receive tenant tokens
   */
  @AuthOptions({ identity: true })
  @Post('tenant-switch')
  @Audit('AUTH_TENANT_SWITCH')
  @SwaggerCookieAuth.identityAccessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Select active tenant',
    description:
      'Switch to a specific tenant using identity token. Sets tenant authentication cookies. Identity tokens are preserved.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Tenant switched successfully. Tenant authentication cookies set.',
    type: TenantSwitchResponseDto,
  })
  @ApiValidationError()
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Identity token required',
  })
  @ApiForbiddenError('User does not belong to specified tenant')
  @ApiNotFoundError('Tenant')
  @ApiPublicResponses()
  async tenantSwitch(
    @Body() tenantSwitchDto: TenantSwitchDto,
    @CurrentUserIdentity() identityUser: AuthenticatedIdentityUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<TenantSwitchResponseDto> {
    const { tenantAccessToken, tenantRefreshToken, user, tenant } =
      await this.authService.tenantSwitch(
        identityUser,
        tenantSwitchDto.tenantId,
      );

    // Clear old tenant tokens if they exist
    this.authService.clearTenantTokens(reply);

    // Set tenant authentication cookies
    this.authService.setTenantTokens(
      reply,
      tenantAccessToken,
      tenantRefreshToken,
    );

    // Keep identity tokens (don't clear them)

    return {
      tenant,
      user,
    };
  }

  /**
   * 5a. POST /auth/refresh-identity
   * Refresh identity access token using identity refresh token
   */
  @Post('refresh-identity')
  @Audit('AUTH_TOKEN_REFRESH', { resourceType: 'auth' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthRefreshGuard)
  @AuthRefreshOptions({ identity: true })
  @SwaggerCookieAuth.identityRefreshToken()
  @ApiOperation({
    summary: 'Refresh identity access token',
    description:
      'Refresh identity access token using identity refresh token from HTTP-only cookie',
  })
  @ApiResponse({
    status: 200,
    description: 'Identity tokens refreshed successfully. New cookies set.',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired identity refresh token',
  })
  @ApiPublicResponses()
  async refreshIdentity(
    @CurrentUserIdentityRefresh()
    identityUser: AuthenticatedIdentityRefreshUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MessageResponseDto> {
    const { identityAccessToken, identityRefreshToken } =
      await this.authService.refreshIdentityTokens(
        identityUser.userId,
        identityUser.email,
        identityUser.refreshToken,
      );

    this.authService.setIdentityTokens(
      reply,
      identityAccessToken,
      identityRefreshToken,
    );
    return { message: 'Identity tokens refreshed successfully' };
  }

  /**
   * 5b. POST /auth/refresh-tenant
   * Refresh tenant access token using tenant refresh token
   */
  @Post('refresh-tenant')
  @Audit('AUTH_TOKEN_REFRESH', { resourceType: 'auth' })
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthRefreshGuard)
  @AuthRefreshOptions({ tenant: true })
  @SwaggerCookieAuth.tenantRefreshToken()
  @ApiOperation({
    summary: 'Refresh tenant access token',
    description:
      'Refresh tenant access token using tenant refresh token from HTTP-only cookie. Does NOT allow switching tenants.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tenant tokens refreshed successfully. New cookies set.',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired tenant refresh token',
  })
  @ApiPublicResponses()
  async refreshTenant(
    @CurrentUserTenantRefresh()
    tenantUser: AuthenticatedTenantRefreshUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MessageResponseDto> {
    const { tenantAccessToken, tenantRefreshToken } =
      await this.authService.refreshTenantTokens(
        tenantUser.userId,
        tenantUser.email,
        tenantUser.tenantId,
        tenantUser.refreshToken,
      );

    this.authService.setTenantTokens(
      reply,
      tenantAccessToken,
      tenantRefreshToken,
    );
    return { message: 'Tenant tokens refreshed successfully' };
  }

  /**
   * 6. POST /auth/logout
   * Logout and invalidate all refresh tokens
   */
  @Post('logout')
  @Audit('AUTH_LOGOUT')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthRefreshGuard)
  @AuthRefreshOptions({ tenant: true, identity: true })
  @SwaggerCookieAuth.identityRefreshToken()
  @SwaggerCookieAuth.tenantRefreshToken()
  @ApiOperation({
    summary: 'Logout from all sessions',
    description:
      'Invalidate all refresh tokens (identity + tenant) and clear all authentication cookies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing identity or tenant refresh token',
  })
  @ApiPublicResponses()
  async logout(
    @CurrentUserIdentityRefresh()
    identityRefreshUser: AuthenticatedIdentityRefreshUser,
    @CurrentUserTenantRefresh()
    tenantRefreshUser: AuthenticatedTenantRefreshUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MessageResponseDto> {
    const { message } = await this.authService.logout(
      identityRefreshUser?.userId ?? tenantRefreshUser?.userId,
      identityRefreshUser?.refreshToken,
      tenantRefreshUser?.refreshToken,
    );
    this.authService.clearAllAuthCookies(reply);
    return { message };
  }

  /**
   * 7. POST /auth/forgot-password
   * Send password reset email
   */
  @Post('forgot-password')
  @Audit('AUTH_PASSWORD_RESET_REQUESTED')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Send password reset email if the email exists. Always returns success for security.',
  })
  @ApiResponse({
    status: 200,
    description: 'If the email exists, a password reset link has been sent',
    type: MessageResponseDto,
  })
  @ApiValidationError()
  @ApiPublicResponses()
  forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
  ): Promise<MessageResponseDto> {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  /**
   * 8. POST /auth/reset-password
   * Reset password using token
   */
  @Post('reset-password')
  @Audit('AUTH_PASSWORD_RESET')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password using token',
    description: 'Reset user password using the token sent via email',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired reset token / Validation error',
  })
  @ApiPublicResponses()
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<MessageResponseDto> {
    return this.authService.resetPassword(resetPasswordDto);
  }

  /**
   * 9. GET /auth/invitations/resolve
   * Resolve invitation token to get invitation details
   */
  @Get('invitations/resolve')
  @ApiOperation({
    summary: 'Resolve invitation token',
    description:
      'Get invitation details from token. Used by frontend to display invitation information before user accepts.',
  })
  @ApiQuery({
    name: 'token',
    description: 'Invitation token from email link',
    required: true,
    type: String,
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation details retrieved successfully',
    type: ResolveInvitationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Token parameter missing or invalid',
  })
  @ApiNotFoundError('Invitation not found or expired')
  @ApiPublicResponses()
  resolveInvitation(
    @Query('token') token: string,
  ): Promise<ResolveInvitationResponseDto> {
    return this.authService.resolveInvitation(token);
  }

  /**
   * 10. GET /auth/invitations
   * List user's pending invitations
   */
  @AuthOptions({ identity: true })
  @Get('invitations')
  @SwaggerCookieAuth.identityAccessToken()
  @SwaggerCookieAuth.tenantAccessToken()
  @ApiOperation({
    summary: "List user's pending invitations",
    description:
      'Retrieve all pending tenant invitations for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitations list retrieved successfully',
    type: InvitationListResponseDto,
  })
  @ApiAuthenticatedResponses()
  listInvitations(
    @CurrentUserIdentity() identityUser: AuthenticatedIdentityUser,
  ): Promise<InvitationListResponseDto> {
    return this.authService.listUserInvitations(identityUser.email);
  }

  /**
   * 11. POST /auth/invitations/:invitationId/accept
   * Accept tenant invitation
   */
  @AuthOptions({ identity: true })
  @Post('invitations/:invitationId/accept')
  @Audit('INVITATION_ACCEPTED', {
    resourceIdParam: 'invitationId',
    resourceType: 'invitations',
  })
  @SwaggerCookieAuth.identityAccessToken()
  @SwaggerCookieAuth.tenantAccessToken()
  @ApiOperation({
    summary: 'Accept tenant invitation',
    description:
      'Accept an invitation to join a tenant. Creates user-tenant relationship.',
  })
  @ApiParam({
    name: 'invitationId',
    description: 'Invitation UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation accepted successfully',
    type: MessageResponseDto,
  })
  @ApiValidationError()
  @ApiForbiddenError('Invitation not for current user')
  @ApiNotFoundError('Invitation not found or expired')
  @ApiConflictError('User already member of tenant')
  @ApiAuthenticatedResponses()
  acceptInvitation(
    @Param() params: InvitationIdParamDto,
    @CurrentUserIdentity() identityUser: AuthenticatedIdentityUser,
  ): Promise<MessageResponseDto> {
    return this.authService.acceptInvitation(
      params.invitationId,
      identityUser.userId,
      identityUser.email,
    );
  }

  /**
   * 12. POST /auth/invitations/:invitationId/reject
   * Reject tenant invitation
   */
  @AuthOptions({ identity: true })
  @Post('invitations/:invitationId/reject')
  @Audit('INVITATION_REJECTED', {
    resourceIdParam: 'invitationId',
    resourceType: 'invitations',
  })
  @SwaggerCookieAuth.identityAccessToken()
  @SwaggerCookieAuth.tenantAccessToken()
  @ApiOperation({
    summary: 'Reject tenant invitation',
    description:
      'Reject an invitation to join a tenant. Deletes the invitation.',
  })
  @ApiParam({
    name: 'invitationId',
    description: 'Invitation UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation rejected successfully',
    type: MessageResponseDto,
  })
  @ApiValidationError()
  @ApiForbiddenError('Invitation not for current user')
  @ApiNotFoundError('Invitation')
  @ApiAuthenticatedResponses()
  rejectInvitation(
    @Param() params: InvitationIdParamDto,
    @CurrentUserIdentity() identityUser: AuthenticatedIdentityUser,
  ): Promise<MessageResponseDto> {
    return this.authService.rejectInvitation(
      params.invitationId,
      identityUser.userId,
      identityUser.email,
    );
  }
}
