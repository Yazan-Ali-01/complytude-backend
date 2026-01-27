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
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { AdminLoginResponseDto } from './dto/admin-login-response.dto';
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
import { JwtBothTokensAuthGuard } from './guards/jwt-both-tokens-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 1. POST /auth/signup
   * Register new user account without creating a tenant
   */
  @Public()
  @Post('signup')
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
  @Public()
  @Post('verify-email')
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
   * Login and receive temporary auth cookie for tenant selection
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login to user account',
    description:
      'Authenticate user and return temporary auth cookie. User must then select a tenant to receive full authentication. Not for system admins.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Login successful. Temporary auth cookie set. Returns user info and list of tenants.',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description:
      'Invalid credentials, email not verified, or system admin attempting to use this endpoint',
  })
  @ApiValidationError()
  @ApiPublicResponses()
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponseDto> {
    const { tempAuthToken, ...loginResponse } =
      await this.authService.login(loginDto);
    this.authService.setTempAuthCookie(reply, tempAuthToken);
    return new LoginResponseDto(loginResponse);
  }

  /**
   * 3b. POST /auth/admin/login
   * System admin login - receives full authentication immediately
   */
  @Public()
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'System admin login',
    description:
      'Authenticate system administrator. Returns full access and refresh tokens immediately without tenant selection. Only for system admins.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Admin login successful. Full authentication cookies set. Returns admin user info.',
    type: AdminLoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description:
      'Invalid credentials, email not verified, or non-admin attempting to use this endpoint',
  })
  @ApiValidationError()
  @ApiPublicResponses()
  async adminLogin(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AdminLoginResponseDto> {
    const { accessToken, refreshToken, ...adminLoginResponse } =
      await this.authService.adminLogin(loginDto);
    this.authService.setAuthCookies(reply, accessToken, refreshToken);
    return new AdminLoginResponseDto(adminLoginResponse);
  }

  /**
   * 4. POST /auth/tenant-switch
   * Select active tenant and receive full authentication
   */
  @Public()
  @UseGuards(JwtBothTokensAuthGuard)
  @Post('tenant-switch')
  @SwaggerCookieAuth.tempAuthToken()
  @SwaggerCookieAuth.accessToken()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Select active tenant',
    description:
      'Switch to a specific tenant. Accepts either tempAuthToken (from login) or accessToken (from existing session). Sets full authentication cookies.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Tenant switched successfully. Full authentication cookies set.',
    type: TenantSwitchResponseDto,
  })
  @ApiValidationError()
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - No valid authentication token',
  })
  @ApiForbiddenError('User does not belong to specified tenant')
  @ApiNotFoundError('Tenant')
  @ApiPublicResponses()
  async tenantSwitch(
    @Body() tenantSwitchDto: TenantSwitchDto,
    @CurrentUser() currentUser: { userId: string; email: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<TenantSwitchResponseDto> {
    const { accessToken, refreshToken, user, tenant } =
      await this.authService.tenantSwitch(
        currentUser,
        tenantSwitchDto.tenantId,
      );

    // Set full authentication cookies
    this.authService.setAuthCookies(reply, accessToken, refreshToken);

    // Clear temp auth token if present
    this.authService.clearTempAuthCookie(reply);

    return {
      tenant,
      user,
    };
  }

  /**
   * 5. POST /auth/refresh
   * Refresh access token using refresh token
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @SwaggerCookieAuth.refreshToken()
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Refresh access token using refresh token from HTTP-only cookie',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully. New cookies set.',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
  })
  @ApiPublicResponses()
  async refresh(
    @CurrentUser()
    user: { userId: string; email: string; refreshToken: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MessageResponseDto> {
    const { accessToken, refreshToken } = await this.authService.refreshTokens(
      user.userId,
      user.email,
      user.refreshToken,
    );

    this.authService.setAuthCookies(reply, accessToken, refreshToken);
    return { message: 'Tokens refreshed successfully' };
  }

  /**
   * 6. POST /auth/logout
   * Logout and invalidate refresh token
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @SwaggerCookieAuth.refreshToken()
  @ApiOperation({
    summary: 'Logout from current session',
    description:
      'Invalidate refresh token and clear all authentication cookies',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid refresh token',
  })
  @ApiPublicResponses()
  async logout(
    @CurrentUser() user: { userId: string; refreshToken: string },
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MessageResponseDto> {
    const { message } = await this.authService.logout(
      user.userId,
      user.refreshToken,
    );
    this.authService.clearAuthCookies(reply);
    return { message };
  }

  /**
   * 7. POST /auth/forgot-password
   * Send password reset email
   */
  @Public()
  @Post('forgot-password')
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
  @Public()
  @Post('reset-password')
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
  @Public()
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
  @Public()
  @UseGuards(JwtBothTokensAuthGuard)
  @Get('invitations')
  @SwaggerCookieAuth.tempAuthToken()
  @SwaggerCookieAuth.accessToken()
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
    @CurrentUser() user: { userId: string; email: string },
  ): Promise<InvitationListResponseDto> {
    return this.authService.listUserInvitations(user.email);
  }

  /**
   * 11. POST /auth/invitations/:invitationId/accept
   * Accept tenant invitation
   */
  @Public()
  @UseGuards(JwtBothTokensAuthGuard)
  @Post('invitations/:invitationId/accept')
  @SwaggerCookieAuth.tempAuthToken()
  @SwaggerCookieAuth.accessToken()
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
    @CurrentUser() user: { userId: string; email: string },
  ): Promise<MessageResponseDto> {
    return this.authService.acceptInvitation(
      params.invitationId,
      user.userId,
      user.email,
    );
  }

  /**
   * 12. POST /auth/invitations/:invitationId/reject
   * Reject tenant invitation
   */
  @Public()
  @UseGuards(JwtBothTokensAuthGuard)
  @Post('invitations/:invitationId/reject')
  @SwaggerCookieAuth.tempAuthToken()
  @SwaggerCookieAuth.accessToken()
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
    @CurrentUser() user: { userId: string; email: string },
  ): Promise<MessageResponseDto> {
    return this.authService.rejectInvitation(
      params.invitationId,
      user.userId,
      user.email,
    );
  }
}
