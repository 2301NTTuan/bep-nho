import { ConflictException, INestApplication, Module, Type, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FeedbackController } from './feedback/feedback.controller';
import { FeedbackService } from './feedback/feedback.service';
import { DevController } from './dev/dev.controller';
import { CurrentUserService } from './identity/current-user.service';
import { ApiExceptionFilter } from './http/api-exception.filter';

const currentUser = {
  resolveByAuthSubject: jest.fn().mockResolvedValue({
    user: { id: randomUuid(), locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh' },
    tasteProfile: null,
  }),
};

function randomUuid() {
  return '00000000-0000-4000-8000-000000000001';
}

@Module({
  controllers: [DevController],
  providers: [
    { provide: CurrentUserService, useValue: currentUser },
    { provide: ConfigService, useValue: { get: () => 'development' } },
  ],
})
class DevelopmentDevModule {}

@Module({
  controllers: [DevController],
  providers: [
    { provide: CurrentUserService, useValue: currentUser },
    { provide: ConfigService, useValue: { get: () => 'production' } },
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
  }],
})
class ConflictModule {}

async function start(module: Type<unknown>) {
  const app = await NestFactory.create(module, { logger: false });
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

  it('returns standardized conflict instead of leaking an internal error', async () => {
    const server = await start(ConflictModule);
    apps.push(server.app);
    const response = await fetch(`${server.base}/cook-sessions/${randomUuid()}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dimensions: { saltiness: 0 } }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()) as object).toMatchObject({
      error: { code: 'CONFLICT', message: 'Feedback already exists for this cook session' },
    });
  });
});
