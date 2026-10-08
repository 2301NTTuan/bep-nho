import { Controller, Get, NotFoundException, Post, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import type { CookieResponse } from '../auth/auth.types';
import { SessionCookieService } from '../auth/cookies';
import { CurrentUserService } from '../identity/current-user.service';

@Controller('dev')
export class DevController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly cookies: SessionCookieService,
  ) {}

  @Get('bootstrap')
  async bootstrap() {
    const environment = this.config.get<string>('NODE_ENV', 'development');

    if (environment === 'production') {
      throw new NotFoundException();
    }

    const context = await this.currentUser.resolveByAuthSubject('dev-local-user');

    return {
      data: {
        environment,
        ...context,
      },
    };
  }

  @Post('session')
  async session(@Res({ passthrough: true }) response: CookieResponse) {
    const environment = this.config.get<string>('NODE_ENV', 'development');

    if (environment === 'production') {
      throw new NotFoundException();
    }

    const context = await this.currentUser.resolveByAuthSubject('dev-local-user');
    const result = await this.auth.establishSession(context.user.id);
    this.cookies.set(response, result.token, result.expiresAt);

    return {
      data: {
        environment,
        ...result.context,
      },
    };
  }
}
