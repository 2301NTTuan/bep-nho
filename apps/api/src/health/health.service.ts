import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../database/prisma.service';

type CheckState = {
  status: 'ok' | 'error';
  latencyMs: number;
  error?: string;
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async checkDatabase(): Promise<CheckState> {
    const start = Date.now();

    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'error',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }

  private async checkRedis(): Promise<CheckState> {
    const start = Date.now();

    const redis = new Redis(
      this.config.getOrThrow<string>('REDIS_URL'),
      {
        lazyConnect: true,
        connectTimeout: 1500,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
      },
    );

    try {
      await redis.connect();
      const response = await redis.ping();

      if (response !== 'PONG') {
        throw new Error(`Unexpected Redis response: ${response}`);
      }

      return {
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'error',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'unknown error',
      };
    } finally {
      redis.disconnect();
    }
  }

  private async checkObjectStorage(): Promise<CheckState> {
    const start = Date.now();

    try {
      const endpoint =
        this.config
          .getOrThrow<string>('S3_ENDPOINT')
          .replace(/\/+$/, '');

      const response = await fetch(
        `${endpoint}/minio/health/live`,
        {
          signal: AbortSignal.timeout(1500),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Object storage health returned HTTP ${response.status}`,
        );
      }

      return {
        status: 'ok',
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'error',
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }

  async readiness() {
    const [database, redis, objectStorage] =
      await Promise.all([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkObjectStorage(),
      ]);

    const healthy =
      database.status === 'ok' &&
      redis.status === 'ok' &&
      objectStorage.status === 'ok';

    return {
      status: healthy ? 'ok' : 'degraded',
      service: 'bep-nho-api',
      timestamp: new Date().toISOString(),

      dependencies: {
        database,
        redis,
        objectStorage,
      },
    };
  }
}
