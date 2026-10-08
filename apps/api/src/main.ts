import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureHttp } from './http/configure-http';

async function bootstrap(): Promise<void> {
  const app =
    await NestFactory.create(AppModule);

  const config =
    app.get(ConfigService);

  configureHttp(app, config);

  app.enableShutdownHooks();

  const port =
    config.get<number>('PORT', 3001);

  await app.listen(port, '0.0.0.0');

  console.log(
    `Bep Nho API listening on http://localhost:${port}/v1`,
  );
}

void bootstrap();
