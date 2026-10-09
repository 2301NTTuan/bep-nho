import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import {
  AuthRateLimitExceededException,
  AuthRateLimitService,
  type AuthRateLimitEndpoint,
} from './auth-rate-limit.service';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: AuthRateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<{
      ip?: string;
      path?: string;
      route?: { path?: string };
    }>();
    const response = http.getResponse<{ setHeader(name: string, value: string): void }>();
    const path = request.route?.path ?? request.path ?? '';
    const endpoint = this.endpointForPath(path);
    try {
      await this.rateLimit.consume(endpoint, request.ip ?? 'unknown');
      return true;
    } catch (error) {
      if (error instanceof AuthRateLimitExceededException) {
        response.setHeader('Retry-After', String(error.retryAfter));
      }
      throw error;
    }
  }

  private endpointForPath(path: string): AuthRateLimitEndpoint {
    if (path.endsWith('/register')) return 'register';
    if (path.endsWith('/email-verification/request')) return 'email_verification_request';
    if (path.endsWith('/email-verification/confirm')) return 'email_verification_confirm';
    if (path.endsWith('/password-reset/request')) return 'password_reset_request';
    if (path.endsWith('/password-reset/confirm')) return 'password_reset_confirm';
    return 'login';
  }
}
