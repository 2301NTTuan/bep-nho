import type { INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { SESSION_COOKIE_NAME } from '../auth/auth.constants';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Bếp Nhớ API')
    .setDescription('HTTP contract for the Bếp Nhớ alpha API.')
    .setVersion('1.0.0')
    .addCookieAuth(
      SESSION_COOKIE_NAME,
      { type: 'apiKey', in: 'cookie', name: SESSION_COOKIE_NAME },
      'sessionCookie',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,
  });
  if (document.paths['/v1/metrics']) {
    document.paths['/metrics'] = document.paths['/v1/metrics'];
    delete document.paths['/v1/metrics'];
  }
  return document;
}

export function configureOpenApi(app: INestApplication, config: ConfigService): OpenAPIObject | null {
  if (!config.get<boolean>('OPENAPI_ENABLED', true)) return null;
  const document = createOpenApiDocument(app);
  const adapter = app.getHttpAdapter() as unknown as {
    get(path: string, handler: (_request: unknown, response: { json(body: unknown): void }) => void): void;
  };
  adapter.get('/v1/openapi.json', (_request, response) => response.json(document));
  return document;
}
