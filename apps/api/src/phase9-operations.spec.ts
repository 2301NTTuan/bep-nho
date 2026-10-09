import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AuthRateLimitExceededException,
  AuthRateLimitService,
} from './auth/auth-rate-limit.service';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';
import { safeRequestId } from './http/request-id';
import { MetricsService } from './observability/metrics.service';

function config(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    getOrThrow: (key: string) => {
      if (values[key] === undefined) throw new Error(`Missing ${key}`);
      return values[key];
    },
  } as unknown as ConfigService;
}

describe('Phase 9 operations and security', () => {
  it('accepts only bounded conservative caller request IDs', () => {
    expect(safeRequestId('alpha-1_2:3.4')).toBe('alpha-1_2:3.4');
    expect(safeRequestId('x'.repeat(64))).toBe('x'.repeat(64));
    expect(safeRequestId('x'.repeat(65))).toMatch(/^[0-9a-f-]{36}$/);
    expect(safeRequestId('unsafe request id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(safeRequestId(['safe-first', 'ignored'])).toBe('safe-first');
  });

  it('keeps liveness dependency-free and readiness returns 503 when degraded', async () => {
    const service = {
      readiness: jest.fn().mockResolvedValue({
        status: 'degraded',
        dependencies: { database: { status: 'error' }, redis: { status: 'ok' } },
      }),
    } as unknown as HealthService;
    const controller = new HealthController(service);
    expect(controller.liveness()).toMatchObject({ status: 'ok', service: 'bep-nho-api' });
    await expect(controller.readiness()).rejects.toMatchObject({ status: 503 });
  });

  it('checks only PostgreSQL and Redis for readiness', async () => {
    const service = new HealthService(
      { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) } as never,
      config({ REDIS_URL: 'redis://127.0.0.1:6379' }),
    );
    const result = await service.readiness();
    expect(result.status).toBe('ok');
    expect(result.dependencies).toHaveProperty('database');
    expect(result.dependencies).toHaveProperty('redis');
    expect(result.dependencies).not.toHaveProperty('objectStorage');
  });

  it('uses independent configurable Redis buckets and returns a generic 429', async () => {
    const settings = config({
      NODE_ENV: 'production',
      REDIS_URL: 'redis://127.0.0.1:6379',
      AUTH_RATE_LIMIT_LOGIN_POINTS: 2,
      AUTH_RATE_LIMIT_REGISTER_POINTS: 1,
      AUTH_RATE_LIMIT_WINDOW_SECONDS: 2,
      METRICS_ENABLED: true,
    });
    const metrics = new MetricsService(settings);
    const limiter = new AuthRateLimitService(settings, metrics);
    const key = `phase9-${Date.now()}-${Math.random()}`;
    try {
      await expect(limiter.consume('login', key)).resolves.toBeUndefined();
      await expect(limiter.consume('login', key)).resolves.toBeUndefined();
      const rejected = limiter.consume('login', key);
      await expect(rejected).rejects.toBeInstanceOf(AuthRateLimitExceededException);
      await expect(rejected).rejects.toMatchObject({
        status: 429,
        message: 'Too many authentication attempts. Please try again later.',
      });
      await expect(limiter.consume('register', key)).resolves.toBeUndefined();
      await expect(limiter.consume('register', key)).rejects.toBeInstanceOf(HttpException);
      expect(await metrics.registry.getSingleMetricAsString(
        'bep_nho_auth_rate_limit_rejections_total',
      )).toContain('endpoint="login"');
    } finally {
      limiter.onModuleDestroy();
    }
  });

  it('fails closed when Redis-backed abuse protection is unavailable', async () => {
    const settings = config({
      NODE_ENV: 'production',
      REDIS_URL: 'redis://127.0.0.1:6399',
      AUTH_RATE_LIMIT_LOGIN_POINTS: 2,
      AUTH_RATE_LIMIT_REGISTER_POINTS: 1,
      AUTH_RATE_LIMIT_WINDOW_SECONDS: 1,
      METRICS_ENABLED: false,
    });
    const limiter = new AuthRateLimitService(settings, new MetricsService(settings));
    try {
      await expect(limiter.consume('login', `down-${Date.now()}`))
        .rejects.toBeInstanceOf(ServiceUnavailableException);
    } finally {
      limiter.onModuleDestroy();
    }
  });

  it('commits an OpenAPI contract with all required routes and no removed user routes', async () => {
    const artifact = resolve(__dirname, '../../../docs/openapi/openapi.json');
    const document = JSON.parse(await readFile(artifact, 'utf8')) as {
      openapi: string;
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(document.openapi).toMatch(/^3\./);
    const required = [
      '/v1/auth/register', '/v1/auth/login', '/v1/auth/logout', '/v1/me',
      '/v1/recipes', '/v1/recipes/{slug}', '/v1/cook-sessions',
      '/v1/cook-sessions/{id}', '/v1/cook-sessions/{id}/events',
      '/v1/cook-sessions/{id}/complete', '/v1/cook-sessions/{id}/feedback',
      '/v1/me/cook-sessions/active', '/v1/me/taste-profile',
      '/v1/me/taste-profile/history',
      '/v1/me/taste-profile/dimensions/{dimensionKey}/override',
      '/v1/me/taste-profile/dimensions/{dimensionKey}/reset',
      '/v1/me/recipes/{slug}/personalized-versions',
      '/v1/me/recipes/{slug}/personalized-versions/latest',
      '/v1/me/recipes/{slug}/personalized-versions/overview',
      '/v1/me/recipes/{slug}/personalized-versions/best',
      '/v1/me/recipes/{slug}/personalized-versions/{versionId}/decisions',
      '/v1/me/recipes/{slug}/personalized-versions/{versionId}/adjustments/{ingredientSlug}/decisions',
    ];
    for (const route of required) expect(document.paths).toHaveProperty(route);
    expect(Object.keys(document.paths).some((route) => route.includes('/users/'))).toBe(false);
    expect(document.components.securitySchemes).toHaveProperty('sessionCookie');
  });
});
