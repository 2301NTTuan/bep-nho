import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AuthController, MeController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionCookieService } from './cookies';
import { PasswordService } from './password.service';
import { SessionAuthGuard } from './session-auth.guard';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AccountLifecycleService } from './account-lifecycle.service';
import { DevelopmentMailOutbox, MailDeliveryService } from './mail-delivery.service';

@Module({
  imports: [IdentityModule],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    PasswordService,
    SessionCookieService,
    SessionAuthGuard,
    AuthRateLimitService,
    AuthRateLimitGuard,
    AccountLifecycleService,
    DevelopmentMailOutbox,
    MailDeliveryService,
  ],
  exports: [
    AuthService,
    SessionCookieService,
    SessionAuthGuard,
    AccountLifecycleService,
    DevelopmentMailOutbox,
  ],
})
export class AuthModule {}
