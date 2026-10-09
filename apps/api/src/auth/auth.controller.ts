import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
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

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: SessionCookieService,
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
  constructor(private readonly currentUser: CurrentUserService) {}

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({ summary: 'Return the current authenticated user context.' })
  @ApiResponse({ status: 200, description: 'Current user and Taste profile.' })
  async get(@CurrentUser() identity: AuthenticatedIdentity) {
    return { data: await this.currentUser.resolveById(identity.userId) };
  }
}
