import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function configuredOrigins(config: ConfigService): string[] {
  return config
    .get<string>('CORS_ORIGIN', '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin;
      } catch {
        return value.replace(/\/$/, '');
      }
    });
}

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method: string;
      headers: Record<string, string | string[] | undefined>;
    }>();

    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const rawOrigin = request.headers.origin;
    const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
    const environment = this.config.get<string>('NODE_ENV', 'development');

    // Jest and direct service tests are non-browser callers. Every deployed
    // development/production mutation must carry an approved browser Origin.
    if (!origin && environment === 'test') {
      return true;
    }

    let normalizedOrigin: string | null = null;
    try {
      normalizedOrigin = origin ? new URL(origin).origin : null;
    } catch {
      normalizedOrigin = null;
    }

    if (!normalizedOrigin || !configuredOrigins(this.config).includes(normalizedOrigin)) {
      throw new ForbiddenException('Request origin is not allowed.');
    }

    return true;
  }
}
