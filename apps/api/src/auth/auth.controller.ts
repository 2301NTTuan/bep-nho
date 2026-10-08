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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: SessionCookieService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.auth.register(dto.email, dto.password);
    this.cookies.set(response, result.token, result.expiresAt);
    return { data: result.context };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: CookieResponse) {
    const result = await this.auth.login(dto.email, dto.password);
    this.cookies.set(response, result.token, result.expiresAt);
    return { data: result.context };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: CookieResponse) {
    await this.auth.revoke(readCookie(request.headers.cookie, SESSION_COOKIE_NAME));
    this.cookies.clear(response);
    return { data: { loggedOut: true } };
  }
}

@Controller()
export class MeController {
  constructor(private readonly currentUser: CurrentUserService) {}

  @Get('me')
  @UseGuards(SessionAuthGuard)
  async get(@CurrentUser() identity: AuthenticatedIdentity) {
    return { data: await this.currentUser.resolveById(identity.userId) };
  }
}
