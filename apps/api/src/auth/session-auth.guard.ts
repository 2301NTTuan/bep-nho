import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SESSION_COOKIE_NAME } from './auth.constants';
import type { AuthenticatedRequest } from './auth.types';
import { AuthService } from './auth.service';
import { readCookie } from './cookies';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    const identity = token ? await this.auth.authenticate(token) : null;

    if (!identity) {
      throw new UnauthorizedException('Authentication required.');
    }

    request.authenticatedIdentity = identity;
    return true;
  }
}
