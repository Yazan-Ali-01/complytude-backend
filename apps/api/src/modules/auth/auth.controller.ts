import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
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
import { VerifiedUserGuard } from 'src/common/guards/verified-user.guard';
import { Audit } from '../../common/decorators/audit.decorator';
import { AuthService } from './auth.service';
import {
  AuthOptions,
  AuthRefreshOptions,
  Public,
} from './decorators/auth-options.decorator';
import {
  CurrentUserIdentity,
  CurrentUserIdentityRefresh,
  CurrentUserTenant,
  CurrentUserTenantRefresh,
} from './decorators/current-user.decorator';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { InvitationIdParamDto } from './dto/invitation-id-param.dto';
import { InvitationListResponseDto } from './dto/invitation-list-response.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { LoginDto } from './dto/login.dto';
import { RenameSessionDto } from './dto/rename-session.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResolveInvitationResponseDto } from './dto/resolve-invitation-response.dto';
import { SessionIdParamDto } from './dto/session-id-param.dto';
import { SessionListResponseDto } from './dto/session-list-response.dto';
import { SignupDto } from './dto/signup.dto';
import { TenantSwitchResponseDto } from './dto/tenant-switch-response.dto';
import { TenantSwitchDto } from './dto/tenant-switch.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { SsoCallbackExceptionFilter } from './filters/sso-callback-exception.filter';
import {
  GoogleSsoAuthGuard,
  JwtAuthRefreshGuard,
  MicrosoftSsoAuthGuard,
} from './guards';
import type {
  AuthenticatedIdentityRefreshUser,
  AuthenticatedIdentityUser,
  AuthenticatedTenantRefreshUser,
  AuthenticatedTenantUser,
} from './strategies';
import type { SsoOAuthProfile } from './strategies/sso-payload.interface';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { AUTH_RATE_LIMITS } from '../../common/rate-limit/rate-limit.constants';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 1. POST /auth/signup
   * Register new user account without creating a tenant
   */
  @Post('signup')
  @RateLimit(...AUTH_RATE_LIMITS.signup)
  @Public()
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
   * GET /auth/google — OAuth2: redirect to Google consent (identity tokens issued on callback).
   */
  @Get('google')
  @Public()
  @UseGuards(GoogleSsoAuthGuard)
  @Audit('AUTH_SSO_GOOGLE_START')
  @ApiOperation({
    summary: 'Start Google OAuth2 sign-in',
    description:
      'Redirects the browser to Google. After consent, Google redirects to GET /auth/google/callback; the API sets identity cookies and redirects to the SPA (FRONTEND_URL + SSO_FRONTEND_SUCCESS_PATH). Disabled when GOOGLE_* env vars are unset.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to Google authorization server',
  })
  @ApiResponse({
    status: 503,
    description: 'Google SSO is not configured',
  })
  @ApiPublicResponses()
  googleAuth(): void {
    /* Passport guard issues redirect; this handler is not used */
  }

  /**
   * GET /auth/google/callback — Google OAuth2 callback
   */
  @Get('google/callback')
  @Public()
  @UseGuards(GoogleSsoAuthGuard)
  @UseFilters(SsoCallbackExceptionFilter)
  @Audit('AUTH_SSO_GOOGLE_CALLBACK')
  @ApiOperation({
    summary: 'Google OAuth2 callback',
    description:
      'Handles Google redirect: creates or links user, sets identity cookies, redirects to frontend success URL.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to frontend with cookies set',
  })
  @ApiResponse({ status: 503, description: 'Google SSO is not configured' })
  @ApiPublicResponses()
  async googleAuthCallback(
    @Req() request: FastifyRequest & { user: SsoOAuthProfile },
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    return this.handleSsoCallback(request, reply, 'google');
  }

  /**
   * GET /auth/microsoft — OAuth2: redirect to Microsoft consent
   */
  @Get('microsoft')
  @Public()
  @UseGuards(MicrosoftSsoAuthGuard)
  @Audit('AUTH_SSO_MICROSOFT_START')
  @ApiOperation({
    summary: 'Start Microsoft OAuth2 sign-in',
    description:
      'Redirects the browser to Microsoft. Callback: GET /auth/microsoft/callback. Disabled when MICROSOFT_* env vars are unset.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to Microsoft authorization server',
  })
  @ApiResponse({
    status: 503,
    description: 'Microsoft SSO is not configured',
  })
  @ApiPublicResponses()
  microsoftAuth(): void {
    /* Passport guard issues redirect */
  }

  /**
   * GET /auth/microsoft/callback — Microsoft OAuth2 callback
   */
  @Get('microsoft/callback')
  @Public()
  @UseGuards(MicrosoftSsoAuthGuard)
  @UseFilters(SsoCallbackExceptionFilter)
  @Audit('AUTH_SSO_MICROSOFT_CALLBACK')
  @ApiOperation({
    summary: 'Microsoft OAuth2 callback',
    description:
      'Handles Microsoft redirect: creates or links user, sets identity cookies, redirects to frontend.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to frontend with cookies set',
  })
  @ApiResponse({ status: 503, description: 'Microsoft SSO is not configured' })
  @ApiPublicResponses()
  async microsoftAuthCallback(
    @Req() request: FastifyRequest & { user: SsoOAuthProfile },
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    return this.handleSsoCallback(request, reply, 'microsoft');
  }

  private async handleSsoCallback(
    request: FastifyRequest & { user: SsoOAuthProfile },
    reply: FastifyReply,
    provider: string,
  ): Promise<void> {
    const { identityAccessToken, identityRefreshToken } =
      await this.authService.validateOrCreateSsoUser(request.user, request);
    this.authService.clearAllAuthCookies(reply);
    this.authService.setIdentityTokens(
      reply,
      identityAccessToken,
      identityRefreshToken,
    );
    const url = this.authService.getSsoFrontendRedirectUrl('success', {
      provider,
    });
    await reply.redirect(url);
  }

  /**
   * 2. POST /auth/verify-email
   * Verify email address using token
   */
  @Post('verify-email')
  @RateLimit(...AUTH_RATE_LIMITS.tokenCheck)
  @Public()
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
  @RateLimit(...AUTH_RATE_LIMITS.login)
  @Public()
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
    description:
      'Invalid credentials, or the email is not verified yet (checked after the password)',
  })
  @ApiValidationError()
  @ApiPublicResponses()
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponseDto> {
    const { identityAccessToken, identityRefreshToken, ...loginResponse } =
      await this.authService.login(loginDto, request);

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
  @UseGuards(VerifiedUserGuard)
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
  @ApiForbiddenError(
    'Email not verified (read from the database), or user does not belong to specified tenant',
  )
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
    const { identityAccessToken } =
      await this.authService.refreshIdentityTokens(
        identityUser.userId,
        identityUser.email,
        identityUser.sessionId,
      );

    this.authService.setIdentityTokens(
      reply,
      identityAccessToken,
      identityUser.refreshToken,
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
    const { tenantAccessToken } = await this.authService.refreshTenantTokens(
      tenantUser.userId,
      tenantUser.email,
      tenantUser.tenantId,
      tenantUser.sessionId,
    );

    this.authService.setTenantTokens(
      reply,
      tenantAccessToken,
      tenantUser.refreshToken,
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
    summary: 'Logout from current session context',
    description:
      'Deletes the corresponding Redis session(s) for the refresh token(s) sent (identity and/or tenant), then clears cookies. Use session DELETE endpoints for targeted or global logout.',
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
    const userId =
      identityRefreshUser?.userId ?? tenantRefreshUser?.userId ?? '';
    const { message } = await this.authService.logout(
      userId,
      identityRefreshUser?.sessionId,
      tenantRefreshUser?.sessionId,
      tenantRefreshUser?.tenantId,
    );
    this.authService.clearAllAuthCookies(reply);
    return { message };
  }

  /**
   * GET /auth/sessions/all
   * List all sessions across all tenants (identity access token required)
   */
  @AuthOptions({ identity: true })
  @Get('sessions/all')
  @Audit('SESSION_LIST_ALL', { resourceType: 'sessions' })
  @SwaggerCookieAuth.identityAccessToken()
  @ApiOperation({
    summary: 'List all sessions',
    description:
      'List identity sessions and linked tenant sessions across all tenants. Requires identity access token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sessions retrieved successfully',
    type: SessionListResponseDto,
  })
  @ApiAuthenticatedResponses()
  listAllSessions(
    @CurrentUserIdentity() identityUser: AuthenticatedIdentityUser,
  ): Promise<SessionListResponseDto> {
    return this.authService.getAllSessions(
      identityUser.userId,
      identityUser.sessionId,
      undefined,
    );
  }

  /**
   * GET /auth/sessions
   * List sessions for current tenant (identity + tenant access token required)
   */
  @AuthOptions({ identity: true, tenant: true })
  @Get('sessions')
  @Audit('SESSION_LIST', { resourceType: 'sessions' })
  @SwaggerCookieAuth.identityAccessToken()
  @SwaggerCookieAuth.tenantAccessToken()
  @ApiOperation({
    summary: 'List sessions for current tenant',
    description:
      'List identity sessions and linked tenant sessions for the current tenant. Requires identity and tenant access tokens.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sessions retrieved successfully',
    type: SessionListResponseDto,
  })
  @ApiAuthenticatedResponses()
  listSessions(
    @CurrentUserIdentity() identityUser: AuthenticatedIdentityUser,
    @CurrentUserTenant() tenantUser: AuthenticatedTenantUser,
  ): Promise<SessionListResponseDto> {
    return this.authService.getSessionsForCurrentTenant(
      identityUser.userId,
      tenantUser.tenantId,
      identityUser.sessionId,
      tenantUser.sessionId,
    );
  }

  /**
   * DELETE /auth/sessions/all
   * Logout all sessions (all tenants, all devices)
   */
  @AuthOptions({ identity: true })
  @Delete('sessions/all')
  @Audit('SESSION_LOGOUT_ALL', { resourceType: 'sessions' })
  @SwaggerCookieAuth.identityAccessToken()
  @ApiOperation({
    summary: 'Logout all sessions',
    description:
      'Invalidate all sessions across all tenants and devices. Clears all auth cookies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    type: MessageResponseDto,
  })
  @ApiAuthenticatedResponses()
  async logoutAllSessions(
    @CurrentUserIdentity() identityUser: AuthenticatedIdentityUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MessageResponseDto> {
    const { message } = await this.authService.logoutAll(identityUser.userId);
    this.authService.clearAllAuthCookies(reply);
    return { message };
  }

  /**
   * DELETE /auth/sessions
   * Logout all sessions for current tenant only
   */
  @AuthOptions({ identity: true, tenant: true })
  @Delete('sessions')
  @Audit('SESSION_LOGOUT_TENANT', { resourceType: 'sessions' })
  @SwaggerCookieAuth.identityAccessToken()
  @SwaggerCookieAuth.tenantAccessToken()
  @ApiOperation({
    summary: 'Logout all sessions for current tenant',
    description:
      'Invalidate all tenant sessions for the current tenant across all devices. Clears tenant cookies only.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    type: MessageResponseDto,
  })
  @ApiAuthenticatedResponses()
  async logoutCurrentTenantSessions(
    @CurrentUserTenant() tenantUser: AuthenticatedTenantUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MessageResponseDto> {
    const { message } = await this.authService.logoutCurrentTenant(
      tenantUser.userId,
      tenantUser.tenantId,
    );
    this.authService.clearTenantTokens(reply);
    return { message };
  }

  /**
   * DELETE /auth/sessions/:sessionId
   * Logout a specific session (identity or tenant; identity cascades to linked tenant sessions)
   */
  @AuthOptions({ identity: true })
  @Delete('sessions/:sessionId')
  @Audit('SESSION_DELETED', {
    resourceType: 'sessions',
    resourceIdParam: 'sessionId',
  })
  @SwaggerCookieAuth.identityAccessToken()
  @ApiOperation({
    summary: 'Logout specific session',
    description:
      'Invalidate a specific identity or tenant session. Deleting an identity session cascades to all linked tenant sessions.',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'Identity or tenant session UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Session invalidated successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Session not found',
  })
  @ApiAuthenticatedResponses()
  async deleteSession(
    @Param() params: SessionIdParamDto,
    @CurrentUserIdentity() identityUser: AuthenticatedIdentityUser,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MessageResponseDto> {
    const { message } = await this.authService.deleteSession(
      identityUser.userId,
      params.sessionId,
    );
    const isCurrentIdentity = params.sessionId === identityUser.sessionId;
    if (isCurrentIdentity) {
      this.authService.clearAllAuthCookies(reply);
    }
    return { message };
  }

  /**
   * PATCH /auth/sessions/:sessionId
   * Rename an identity session (update sessionName)
   */
  @AuthOptions({ identity: true })
  @Patch('sessions/:sessionId')
  @Audit('SESSION_RENAMED', {
    resourceType: 'sessions',
    resourceIdParam: 'sessionId',
  })
  @SwaggerCookieAuth.identityAccessToken()
  @ApiOperation({
    summary: 'Rename session',
    description:
      'Update the user-customizable label for an identity session (e.g. "Work laptop"). Only identity sessions support renaming.',
  })
  @ApiParam({
    name: 'sessionId',
    description: 'Identity session UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Session renamed successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Session not found',
  })
  @ApiAuthenticatedResponses()
  renameSession(
    @Param() params: SessionIdParamDto,
    @Body() dto: RenameSessionDto,
    @CurrentUserIdentity() identityUser: AuthenticatedIdentityUser,
  ): Promise<MessageResponseDto> {
    return this.authService.renameSession(
      identityUser.userId,
      params.sessionId,
      dto,
    );
  }

  /**
   * POST /auth/resend-verification
   * Send a new email verification link
   */
  @Post('resend-verification')
  @RateLimit(...AUTH_RATE_LIMITS.sendsEmail)
  @Public()
  @Audit('AUTH_VERIFICATION_RESENT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend the email verification link',
    description:
      "Sends a new verification link to an account that isn't verified yet and ends the older links. Always answers the same, whether or not the account exists; at most one email a minute per address.",
  })
  @ApiResponse({
    status: 200,
    description:
      'If the account exists and is unverified, a new link has been sent',
    type: MessageResponseDto,
  })
  @ApiValidationError()
  @ApiPublicResponses()
  resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<MessageResponseDto> {
    return this.authService.resendVerificationEmail(dto);
  }

  /**
   * 7. POST /auth/forgot-password
   * Send password reset email
   */
  @Post('forgot-password')
  @RateLimit(...AUTH_RATE_LIMITS.sendsEmail)
  @Public()
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
  @RateLimit(...AUTH_RATE_LIMITS.tokenCheck)
  @Public()
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
  @RateLimit(...AUTH_RATE_LIMITS.tokenCheck)
  @Public()
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
  @UseGuards(VerifiedUserGuard)
  @Get('invitations')
  @SwaggerCookieAuth.identityAccessToken()
  @SwaggerCookieAuth.tenantAccessToken()
  @ApiOperation({
    summary: "List user's pending invitations",
    description:
      'Retrieve all pending tenant invitations for the authenticated user. Requires a verified email.',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitations list retrieved successfully',
    type: InvitationListResponseDto,
  })
  @ApiForbiddenError('Email not verified')
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
  @UseGuards(VerifiedUserGuard)
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
      'Accept an invitation to join a tenant. Creates user-tenant relationship. Requires a verified email that matches the invitation, and the invitation token from the invitation link.',
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
  @ApiForbiddenError(
    'Email not verified, invitation not for current user, or invalid invitation token',
  )
  @ApiNotFoundError('Invitation not found or expired')
  @ApiConflictError('User already member of tenant')
  @ApiAuthenticatedResponses()
  acceptInvitation(
    @Param() params: InvitationIdParamDto,
    @Body() body: AcceptInvitationDto,
    @CurrentUserIdentity() identityUser: AuthenticatedIdentityUser,
  ): Promise<MessageResponseDto> {
    return this.authService.acceptInvitation(
      params.invitationId,
      body.token,
      identityUser.userId,
      identityUser.email,
    );
  }

  /**
   * 12. POST /auth/invitations/:invitationId/reject
   * Reject tenant invitation
   */
  @AuthOptions({ identity: true })
  @UseGuards(VerifiedUserGuard)
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
  @ApiForbiddenError('Email not verified, or invitation not for current user')
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
