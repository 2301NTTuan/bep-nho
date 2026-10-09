import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PrismaService } from './database/prisma.service';
import { configureHttp } from './http/configure-http';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Phase9-test-password!';

describe('Phase 9 HTTP operational baseline', () => {
  const runId = randomUUID().replace(/-/g, '');
  const prefix = `phase9-http-${runId}`;
  const email = `${prefix}@example.com`;
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const previousEnvironment: Record<string, string | undefined> = {};

  async function mutation(path: string, body: unknown): Promise<Response> {
    return fetch(`${base}${path}`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    for (const key of [
      'NODE_ENV',
      'AUTH_RATE_LIMIT_LOGIN_POINTS',
      'AUTH_RATE_LIMIT_REGISTER_POINTS',
      'AUTH_RATE_LIMIT_WINDOW_SECONDS',
      'AUTH_RATE_LIMIT_KEY_PREFIX',
      'LOG_LEVEL',
    ]) previousEnvironment[key] = process.env[key];
    process.env.NODE_ENV = 'production';
    process.env.AUTH_RATE_LIMIT_LOGIN_POINTS = '3';
    process.env.AUTH_RATE_LIMIT_REGISTER_POINTS = '1';
    process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS = '30';
    process.env.AUTH_RATE_LIMIT_KEY_PREFIX = `phase9:http:${runId}`;
    process.env.LOG_LEVEL = 'silent';
    const { AppModule } = await import('./app.module');
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttp(app, app.get(ConfigService));
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    base = `http://127.0.0.1:${address.port}/v1`;
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const credentials = await prisma.userCredential.findMany({
      where: { normalizedEmail: { startsWith: prefix } },
      select: { userId: true },
    });
    await prisma.user.deleteMany({ where: { id: { in: credentials.map((item) => item.userId) } } });
    await app.close();
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('serves OpenAPI, metrics, hardened headers, and bounded request IDs', async () => {
    const health = await fetch(`${base}/health/live`, {
      headers: { 'x-request-id': 'invalid request id '.repeat(20) },
    });
    expect(health.status).toBe(200);
    expect(health.headers.get('x-content-type-options')).toBe('nosniff');
    expect(health.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(health.headers.get('referrer-policy')).toBe('no-referrer');
    expect(health.headers.get('strict-transport-security')).toContain('max-age=31536000');
    expect(health.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);

    const openapi = await fetch(`${base}/openapi.json`);
    expect(openapi.status).toBe(200);
    expect((await openapi.json()) as object).toHaveProperty('paths./v1/auth/login');

    const metrics = await fetch(base.replace(/\/v1$/, '/metrics'));
    expect(metrics.status).toBe(200);
    expect(await metrics.text()).toContain('bep_nho_http_requests_total');
  });

  it('reports live/ready semantics and keeps Origin enforcement intact', async () => {
    expect((await fetch(`${base}/health/live`)).status).toBe(200);
    const ready = await fetch(`${base}/health/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({
      status: 'ok',
      dependencies: { database: { status: 'ok' }, redis: { status: 'ok' } },
    });
    expect((await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    })).status).toBe(403);
    expect((await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { origin: 'https://foreign.example', 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    })).status).toBe(403);
  });

  it('rate-limits login and registration in separate Redis buckets', async () => {
    const registered = await mutation('/auth/register', { email, password: PASSWORD });
    expect(registered.status).toBe(201);

    const successfulLogin = await mutation('/auth/login', { email, password: PASSWORD });
    expect(successfulLogin.status).toBe(200);

    const wrong = await mutation('/auth/login', { email, password: 'wrong-password-value' });
    const missing = await mutation('/auth/login', {
      email: `${prefix}-missing@example.com`,
      password: 'wrong-password-value',
    });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    const wrongBody = await wrong.json() as { error: { message: string } };
    const missingBody = await missing.json() as { error: { message: string } };
    expect(wrongBody.error.message).toBe(missingBody.error.message);

    const limitedLogin = await mutation('/auth/login', { email, password: 'wrong-password-value' });
    expect(limitedLogin.status).toBe(429);
    expect(Number(limitedLogin.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await limitedLogin.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });

    const limitedRegister = await mutation('/auth/register', {
      email: `${prefix}-second@example.com`,
      password: PASSWORD,
    });
    expect(limitedRegister.status).toBe(429);
    expect(Number(limitedRegister.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
