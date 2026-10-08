import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExceptionFilter } from './api-exception.filter';
import { configuredOrigins } from './origin.guard';
import { RequestIdInterceptor } from './request-id.interceptor';

export function configureHttp(app: INestApplication, config: ConfigService): void {
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
  app.enableCors({
    origin: configuredOrigins(config),
    credentials: true,
  });
}
