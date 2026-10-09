import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { ApiExceptionFilter } from './api-exception.filter';
import { configuredOrigins } from './origin.guard';
import { RequestIdInterceptor } from './request-id.interceptor';
import { MetricsService } from '../observability/metrics.service';
import { createOperationalLogger, PinoNestLogger } from '../observability/logging';
import type { Logger } from 'pino';
import { RequestTelemetryInterceptor } from '../observability/request-telemetry.interceptor';
import { configureOpenApi } from '../openapi/openapi';

export function configureHttp(app: INestApplication, config: ConfigService): Logger {
  const environment = config.get<string>('NODE_ENV', 'development');
  const logger = createOperationalLogger(config);
  const trustProxyHops = config.get<number>('TRUST_PROXY_HOPS', 0);
  const express = app.getHttpAdapter().getInstance() as {
    set(name: string, value: number): void;
  };
  express.set('trust proxy', trustProxyHops);

  if (environment === 'production') app.useLogger(new PinoNestLogger(logger));
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: environment === 'production'
      ? { maxAge: 31_536_000, includeSubDomains: true }
      : false,
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.setGlobalPrefix('v1', {
    exclude: [{ path: 'metrics', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter(logger));
  app.useGlobalInterceptors(
    new RequestIdInterceptor(),
    new RequestTelemetryInterceptor(app.get(MetricsService), logger),
  );
  app.enableCors({
    origin: configuredOrigins(config),
    credentials: true,
  });
  configureOpenApi(app, config);
  return logger;
}
