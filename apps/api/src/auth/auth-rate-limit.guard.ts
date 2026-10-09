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
    const endpoint: AuthRateLimitEndpoint = path.endsWith('/register') ? 'register' : 'login';
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
}
