import {
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './http/api-exception.filter';
import { RequestIdInterceptor } from './http/request-id.interceptor';

async function bootstrap(): Promise<void> {
  const app =
    await NestFactory.create(AppModule);

  const config =
    app.get(ConfigService);

  app.setGlobalPrefix('v1');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new RequestIdInterceptor());

  const origins =
    config
      .get<string>('CORS_ORIGIN', '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
  });

  app.enableShutdownHooks();

  const port =
    config.get<number>('PORT', 3001);

  await app.listen(port, '0.0.0.0');

  console.log(
    `Bep Nho API listening on http://localhost:${port}/v1`,
  );
}

void bootstrap();
