import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { createOpenApiDocument } from './openapi';

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortObject(child)]),
  );
}

async function generate(): Promise<void> {
  process.env.NODE_ENV = 'production';
  process.env.DATABASE_URL ??= 'postgresql://contract:contract@127.0.0.1:5432/contract';
  process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
  process.env.S3_ENDPOINT ??= 'http://127.0.0.1:9000';
  process.env.S3_ACCESS_KEY ??= 'contract';
  process.env.S3_SECRET_KEY ??= 'contract';
  process.env.S3_BUCKET ??= 'contract';
  process.env.CORS_ORIGIN ??= 'http://localhost:3000';
  const { AppModule } = await import('../app.module');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('v1');
  const document = createOpenApiDocument(app);
  const target = resolve(process.cwd(), 'docs/openapi/openapi.json');
  await mkdir(resolve(process.cwd(), 'docs/openapi'), { recursive: true });
  await writeFile(target, `${JSON.stringify(sortObject(document), null, 2)}\n`, 'utf8');
  await app.close();
  console.log(`Generated ${target}`);
}

void generate();
