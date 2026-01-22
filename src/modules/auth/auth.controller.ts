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
  signup(@Body() _signupDto: SignupDto): MessageResponseDto {
    // Implementation will be added later
    return {
      message: 'User registered successfully. Please verify your email.',
    };
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
  verifyEmail(@Body() _verifyEmailDto: VerifyEmailDto): MessageResponseDto {
    // Implementation will be added later
    return { message: 'Email verified successfully' };
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
      'Authenticate user and return temporary auth cookie. User must then select a tenant to receive full authentication.',
  })
  @ApiResponse({
    status: 200,
    description:
      'Login successful. Temporary auth cookie set. Returns user info and list of tenants.',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or email not verified',
  })
  @ApiValidationError()
  @ApiPublicResponses()
  login(
    @Body() _loginDto: LoginDto,
    @Res({ passthrough: true }) _reply: FastifyReply,
  ): LoginResponseDto {
    // Implementation will be added later
    // Should set tempAuthToken cookie (10 minutes)
    return {
      message: 'Login successful. Please select a tenant.',
      user: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
      },
      tenants: [],
    };
  }

  /**
   * 4. POST /auth/tenant-switch
   * Select active tenant and receive full authentication
   */
  @Public()
  @Post('tenant-switch')
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
  tenantSwitch(
    @Body() _tenantSwitchDto: TenantSwitchDto,
    @Res({ passthrough: true }) _reply: FastifyReply,
  ): TenantSwitchResponseDto {
    // Implementation will be added later
    // Should validate user belongs to tenant
    // Should set accessToken and refreshToken cookies
    // Should clear tempAuthToken if present
    return {
      message: 'Tenant switched successfully',
      tenant: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Acme Corporation',
      },
      user: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'user@example.com',
        role: 'member',
      },
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
  refresh(
    @CurrentUser()
    _user: { userId: string; email: string; refreshToken: string },
    @Res({ passthrough: true }) _reply: FastifyReply,
  ): MessageResponseDto {
    // Implementation will be added later
    // Should set new accessToken and refreshToken cookies
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
  logout(
    @CurrentUser() _user: { userId: string; refreshToken: string },
    @Res({ passthrough: true }) _reply: FastifyReply,
  ): MessageResponseDto {
    // Implementation will be added later
    // Should revoke refresh token in database
    // Should clear all auth cookies (accessToken, refreshToken, tempAuthToken)
    return { message: 'Logged out successfully' };
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
    @Body() _forgotPasswordDto: ForgotPasswordDto,
  ): MessageResponseDto {
    // Implementation will be added later
    return {
      message: 'If the email exists, a password reset link has been sent',
    };
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
  resetPassword(
    @Body() _resetPasswordDto: ResetPasswordDto,
  ): MessageResponseDto {
    // Implementation will be added later
    return { message: 'Password reset successfully' };
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
    @Query('token') _token: string,
  ): ResolveInvitationResponseDto {
    // Implementation will be added later
    // Should hash token and lookup invitation
    return {
      invitationId: '550e8400-e29b-41d4-a716-446655440000',
      email: 'invitee@example.com',
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      tenantName: 'Acme Corporation',
      role: 'member',
      invitedBy: {
        email: 'admin@company.com',
        name: 'Admin User',
      },
      expiresAt: '2026-02-21T10:00:00.000Z',
      createdAt: '2026-01-21T10:00:00.000Z',
    };
  }

  /**
   * 10. GET /auth/invitations
   * List user's pending invitations
   */
  @Get('invitations')
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
    @CurrentUser() _user: { userId: string; email: string },
  ): InvitationListResponseDto {
    // Implementation will be added later
    return {
      invitations: [],
    };
  }

  /**
   * 11. POST /auth/invitations/:invitationId/accept
   * Accept tenant invitation
   */
  @Post('invitations/:invitationId/accept')
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
    @Param() _params: InvitationIdParamDto,
    @CurrentUser() _user: { userId: string; email: string },
  ): MessageResponseDto {
    // Implementation will be added later
    // Should create user_tenants relationship
    // Should delete invitation after acceptance
    return { message: 'Invitation accepted successfully' };
  }

  /**
   * 12. POST /auth/invitations/:invitationId/reject
   * Reject tenant invitation
   */
  @Post('invitations/:invitationId/reject')
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
    @Param() _params: InvitationIdParamDto,
    @CurrentUser() _user: { userId: string; email: string },
  ): MessageResponseDto {
    // Implementation will be added later
    // Should delete invitation record
    return { message: 'Invitation rejected successfully' };
  }
}
