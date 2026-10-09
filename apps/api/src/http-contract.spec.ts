import { ConflictException, INestApplication, Module, Type, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FeedbackController } from './feedback/feedback.controller';
import { FeedbackService } from './feedback/feedback.service';
import { DevController } from './dev/dev.controller';
import { AuthService } from './auth/auth.service';
import { SessionAuthGuard } from './auth/session-auth.guard';
import { SessionCookieService } from './auth/cookies';
import { CurrentUserService } from './identity/current-user.service';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { DevelopmentMailOutbox } from './auth/mail-delivery.service';

const currentUser = {
  resolveByAuthSubject: jest.fn().mockResolvedValue({
    user: { id: randomUuid(), locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh' },
    tasteProfile: null,
  }),
};

const auth = {
  establishSession: jest.fn().mockResolvedValue({
    token: 'test-session-token',
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    context: currentUser.resolveByAuthSubject(),
  }),
};

const cookies = {
  set: jest.fn(),
};

const mailOutbox = {
  latest: jest.fn().mockReturnValue(null),
};

const developmentConfig = {
  get: (key: string, fallback?: unknown) => ({
    NODE_ENV: 'development',
    DEV_MAIL_OUTBOX_KEY: 'test-only-outbox-key',
  } as Record<string, unknown>)[key] ?? fallback,
};

const productionConfig = {
  get: (key: string, fallback?: unknown) => ({
    NODE_ENV: 'production',
    DEV_MAIL_OUTBOX_KEY: 'production-unused-key',
  } as Record<string, unknown>)[key] ?? fallback,
};

function randomUuid() {
  return '00000000-0000-4000-8000-000000000001';
}

@Module({
  controllers: [DevController],
  providers: [
    { provide: CurrentUserService, useValue: currentUser },
    { provide: AuthService, useValue: auth },
    { provide: SessionCookieService, useValue: cookies },
    { provide: DevelopmentMailOutbox, useValue: mailOutbox },
    { provide: ConfigService, useValue: developmentConfig },
  ],
})
class DevelopmentDevModule {}

@Module({
  controllers: [DevController],
  providers: [
    { provide: CurrentUserService, useValue: currentUser },
    { provide: AuthService, useValue: auth },
    { provide: SessionCookieService, useValue: cookies },
    { provide: DevelopmentMailOutbox, useValue: mailOutbox },
    { provide: ConfigService, useValue: productionConfig },
  ],
})
class ProductionDevModule {}

@Module({
  controllers: [FeedbackController],
  providers: [{
    provide: FeedbackService,
    useValue: {
      submit: () => {
        throw new ConflictException(
          'Feedback already exists for this cook session',
        );
      },
    },
  }, {
    provide: SessionAuthGuard,
    useValue: { canActivate: () => true },
  }, {
    provide: AuthService,
    useValue: {
      authenticate: () => ({ userId: randomUuid(), sessionId: randomUuid() }),
    },
  }],
})
class ConflictModule {}

async function start(module: Type<unknown>) {
  const app = await NestFactory.create(module, { logger: false, abortOnError: false });
  app.setGlobalPrefix('v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number };
  return { app, base: `http://127.0.0.1:${address.port}/v1` };
}

describe('HTTP hardening behavior', () => {
  const apps: INestApplication[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    mailOutbox.latest.mockReset().mockReturnValue(null);
  });

  it('serves development bootstrap in development', async () => {
    const server = await start(DevelopmentDevModule);
    apps.push(server.app);
    const response = await fetch(`${server.base}/dev/bootstrap`);
    expect(response.status).toBe(200);
    expect((await response.json()) as object).toMatchObject({
      data: { environment: 'development' },
    });
  });

  it('returns standardized 404 for bootstrap in production', async () => {
    const server = await start(ProductionDevModule);
    apps.push(server.app);
    const response = await fetch(`${server.base}/dev/bootstrap`);
    expect(response.status).toBe(404);
    expect((await response.json()) as object).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('returns standardized 404 for development sessions in production', async () => {
    const server = await start(ProductionDevModule);
    apps.push(server.app);
    const response = await fetch(`${server.base}/dev/session`, { method: 'POST' });
    expect(response.status).toBe(404);
    expect((await response.json()) as object).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('returns standardized 404 for the development mail outbox in production', async () => {
    const server = await start(ProductionDevModule);
    apps.push(server.app);
    const response = await fetch(
      `${server.base}/dev/mail-outbox/latest?email=test@example.com&type=email_verification`,
      { headers: { 'X-Dev-Mail-Outbox-Key': 'production-unused-key' } },
    );
    expect(response.status).toBe(404);
    expect((await response.json()) as object).toMatchObject({
      error: { code: 'NOT_FOUND' },
    });
  });

  it('hides the development mail outbox when its key is missing or wrong', async () => {
    const server = await start(DevelopmentDevModule);
    apps.push(server.app);
    const url = `${server.base}/dev/mail-outbox/latest?email=test@example.com&type=email_verification`;
    const missing = await fetch(url);
    const wrong = await fetch(url, { headers: { 'X-Dev-Mail-Outbox-Key': 'wrong-outbox-key-value' } });
    expect(missing.status).toBe(404);
    expect(wrong.status).toBe(404);
    expect(mailOutbox.latest).not.toHaveBeenCalled();
  });

  it('allows the configured key to read the development mail outbox', async () => {
    mailOutbox.latest.mockReturnValue({
      type: 'email_verification',
      email: 'test@example.com',
      token: 'raw-development-token',
      url: 'http://localhost:3000/verify-email?token=raw-development-token',
      createdAt: '2026-10-09T00:00:00.000Z',
    });
    const server = await start(DevelopmentDevModule);
    apps.push(server.app);
    const response = await fetch(
      `${server.base}/dev/mail-outbox/latest?email=test@example.com&type=email_verification`,
      { headers: { 'X-Dev-Mail-Outbox-Key': 'test-only-outbox-key' } },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { email: 'test@example.com', token: 'raw-development-token' },
    });
  });

  it('returns standardized conflict instead of leaking an internal error', async () => {
    const server = await start(ConflictModule);
    apps.push(server.app);
    const response = await fetch(`${server.base}/cook-sessions/${randomUuid()}/feedback`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: 'bep_nho_session=test-session-token',
      },
      body: JSON.stringify({ dimensions: { saltiness: 0 } }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()) as object).toMatchObject({
      error: { code: 'CONFLICT', message: 'Feedback already exists for this cook session' },
    });
  });
});
