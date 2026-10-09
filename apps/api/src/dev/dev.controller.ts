import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import type { CookieResponse } from '../auth/auth.types';
import { SessionCookieService } from '../auth/cookies';
import { CurrentUserService } from '../identity/current-user.service';
import { DevelopmentMailOutbox, type LifecycleMailType } from '../auth/mail-delivery.service';

@Controller('dev')
export class DevController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly cookies: SessionCookieService,
    private readonly mailOutbox: DevelopmentMailOutbox,
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

  @Get('mail-outbox/latest')
  latestMail(
    @Query('email') email: string | undefined,
    @Query('type') type: string | undefined,
    @Headers('x-dev-mail-outbox-key') providedKey: string | undefined,
  ) {
    const environment = this.config.get<string>('NODE_ENV', 'development');
    if (environment === 'production') throw new NotFoundException();
    const expectedKey = this.config.get<string>('DEV_MAIL_OUTBOX_KEY', '');
    if (!this.matchesOutboxKey(expectedKey, providedKey)) throw new NotFoundException();
    if (
      !email ||
      (type !== 'email_verification' && type !== 'password_reset')
    ) {
      throw new BadRequestException('A valid email and mail type are required.');
    }
    const message = this.mailOutbox.latest(email, type as LifecycleMailType);
    if (!message) throw new NotFoundException('Development mail was not found.');
    return { data: message };
  }

  private matchesOutboxKey(expected: string, provided: string | undefined): boolean {
    if (!expected || !provided) return false;
    const expectedDigest = createHash('sha256').update(expected).digest();
    const providedDigest = createHash('sha256').update(provided).digest();
    return timingSafeEqual(expectedDigest, providedDigest);
  }
}
