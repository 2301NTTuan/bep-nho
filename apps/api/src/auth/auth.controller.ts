import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserService } from '../identity/current-user.service';
import { AuthService } from './auth.service';
import { SESSION_COOKIE_NAME } from './auth.constants';
import { CurrentUser } from './current-user.decorator';
import { SessionCookieService, readCookie } from './cookies';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionAuthGuard } from './session-auth.guard';
import type { AuthenticatedIdentity, AuthenticatedRequest, CookieResponse } from './auth.types';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiSessionProtected, ApiStandardErrors } from '../openapi/decorators';
import { AccountLifecycleService } from './account-lifecycle.service';
import {
  ChangePasswordDto,
  DeleteAccountDto,
  EmailLifecycleRequestDto,
  PasswordResetConfirmDto,
  TokenConfirmationDto,
} from './dto/account-lifecycle.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: SessionCookieService,
    private readonly lifecycle: AccountLifecycleService,
  ) {}

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Register and establish a cookie session.' })
  @ApiResponse({ status: 201, description: 'Account and session created.' })
  @ApiStandardErrors(400, 403, 409, 429, 503)
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.auth.register(dto.email, dto.password);
    this.cookies.set(response, result.token, result.expiresAt);
    return { data: result.context };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Authenticate and establish a cookie session.' })
  @ApiResponse({ status: 200, description: 'Authenticated.' })
  @ApiStandardErrors(400, 401, 403, 429, 503)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.auth.login(dto.email, dto.password);
    this.cookies.set(response, result.token, result.expiresAt);
    return { data: result.context };
  }

  @Post('email-verification/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Request a single-use verification email with an enumeration-safe response.' })
  @ApiResponse({ status: 202, description: 'The request was accepted regardless of account existence.' })
  @ApiStandardErrors(400, 403, 429, 503)
  requestEmailVerification(@Body() dto: EmailLifecycleRequestDto) {
    return this.lifecycle.requestEmailVerification(dto.email).then((data) => ({ data }));
  }

  @Post('email-verification/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Consume a single-use email verification token.' })
  @ApiResponse({ status: 200, description: 'Email verified.' })
  @ApiStandardErrors(400, 403, 429, 503)
  confirmEmailVerification(@Body() dto: TokenConfirmationDto) {
    return this.lifecycle.confirmEmailVerification(dto.token).then((data) => ({ data }));
  }

  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Request password recovery with an enumeration-safe response.' })
  @ApiResponse({ status: 202, description: 'The request was accepted regardless of account existence.' })
  @ApiStandardErrors(400, 403, 429, 503)
  requestPasswordReset(@Body() dto: EmailLifecycleRequestDto) {
    return this.lifecycle.requestPasswordReset(dto.email).then((data) => ({ data }));
  }

  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: 'Consume a reset token, update the password, and revoke every session.' })
  @ApiResponse({ status: 200, description: 'Password reset; login is required.' })
  @ApiStandardErrors(400, 403, 429, 503)
  async confirmPasswordReset(
    @Body() dto: PasswordResetConfirmDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const data = await this.lifecycle.confirmPasswordReset(dto.token, dto.newPassword);
    this.cookies.clear(response);
    return { data };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('sessionCookie')
  @ApiOperation({ summary: 'Revoke the current cookie session when present.' })
  @ApiResponse({ status: 200, description: 'Session cookie cleared.' })
  @ApiStandardErrors(403)
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: CookieResponse) {
    await this.auth.revoke(readCookie(request.headers.cookie, SESSION_COOKIE_NAME));
    this.cookies.clear(response);
    return { data: { loggedOut: true } };
  }
}

@ApiTags('Identity')
@ApiSessionProtected()
@Controller()
export class MeController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly lifecycle: AccountLifecycleService,
    private readonly cookies: SessionCookieService,
  ) {}

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Return the current authenticated user context.' })
  @ApiResponse({ status: 200, description: 'Current user and Taste profile.' })
  async get(@CurrentUser() identity: AuthenticatedIdentity) {
    return { data: await this.currentUser.resolveById(identity.userId) };
  }

  @Post('me/password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Change password and revoke every other session.' })
  @ApiResponse({ status: 200, description: 'Password changed; current session preserved.' })
  @ApiStandardErrors(400, 401, 403)
  async changePassword(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Body() dto: ChangePasswordDto,
  ) {
    return {
      data: await this.lifecycle.changePassword(
        identity.userId,
        identity.sessionId,
        dto.currentPassword,
        dto.newPassword,
      ),
    };
  }

  @Get('me/sessions')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'List safe metadata for active sessions owned by the current user.' })
  @ApiResponse({ status: 200, description: 'Active sessions; no token or token hash is returned.' })
  async sessions(@CurrentUser() identity: AuthenticatedIdentity) {
    return { data: await this.lifecycle.listSessions(identity.userId, identity.sessionId) };
  }

  @Delete('me/sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Revoke one current-user session.' })
  @ApiResponse({ status: 200, description: 'Session revoked.' })
  @ApiStandardErrors(404)
  async revokeSession(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const data = await this.lifecycle.revokeSession(identity.userId, identity.sessionId, sessionId);
    if (data.currentSessionRevoked) this.cookies.clear(response);
    return { data };
  }

  @Post('me/sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Revoke all other sessions while preserving the authenticated session.' })
  @ApiResponse({ status: 200, description: 'Other sessions revoked.' })
  async revokeOtherSessions(@CurrentUser() identity: AuthenticatedIdentity) {
    return { data: await this.lifecycle.revokeOtherSessions(identity.userId, identity.sessionId) };
  }

  @Delete('me/account')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Permanently delete the account after password and explicit confirmation.' })
  @ApiResponse({ status: 200, description: 'Account and all private user-owned data deleted.' })
  @ApiStandardErrors(400, 401, 403)
  async deleteAccount(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) response: CookieResponse,
  ) {
    const data = await this.lifecycle.deleteAccount(identity.userId, dto.password);
    this.cookies.clear(response);
    return { data };
  }
}
