import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RateLimiterRedis, type RateLimiterRes } from 'rate-limiter-flexible';
import { MetricsService } from '../observability/metrics.service';

export type AuthRateLimitEndpoint =
  | 'login'
  | 'register'
  | 'email_verification_request'
  | 'email_verification_confirm'
  | 'password_reset_request'
  | 'password_reset_confirm';

export class AuthRateLimitExceededException extends HttpException {
  constructor(readonly retryAfter: number) {
    super('Too many authentication attempts. Please try again later.', HttpStatus.TOO_MANY_REQUESTS);
  }
}

@Injectable()
export class AuthRateLimitService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly redisReady: Promise<void>;
  private readonly limiters: Record<AuthRateLimitEndpoint, RateLimiterRedis>;

  constructor(
    config: ConfigService,
    private readonly metrics: MetricsService,
  ) {
    const isTest = config.get<string>('NODE_ENV', 'development') === 'test';
    const duration = config.get<number>('AUTH_RATE_LIMIT_WINDOW_SECONDS', 60);
    const keyPrefix = config.get<string>('AUTH_RATE_LIMIT_KEY_PREFIX', 'bep-nho:auth');
    const loginPoints = isTest && process.env.AUTH_RATE_LIMIT_LOGIN_POINTS === undefined
      ? 10_000
      : config.get<number>('AUTH_RATE_LIMIT_LOGIN_POINTS', 10);
    const registerPoints = isTest && process.env.AUTH_RATE_LIMIT_REGISTER_POINTS === undefined
      ? 10_000
      : config.get<number>('AUTH_RATE_LIMIT_REGISTER_POINTS', 5);
    const lifecycleRequestPoints = isTest && process.env.AUTH_RATE_LIMIT_LIFECYCLE_REQUEST_POINTS === undefined
      ? 10_000
      : config.get<number>('AUTH_RATE_LIMIT_LIFECYCLE_REQUEST_POINTS', 5);
    const lifecycleConfirmPoints = isTest && process.env.AUTH_RATE_LIMIT_LIFECYCLE_CONFIRM_POINTS === undefined
      ? 10_000
      : config.get<number>('AUTH_RATE_LIMIT_LIFECYCLE_CONFIRM_POINTS', 10);
    this.redis = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      connectTimeout: 1_000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    this.redis.on('error', () => undefined);
    this.redisReady = this.redis.connect();
    void this.redisReady.catch(() => undefined);
    this.limiters = {
      login: new RateLimiterRedis({
        storeClient: this.redis,
        keyPrefix: `${keyPrefix}:login`,
        points: loginPoints,
        duration,
      }),
      register: new RateLimiterRedis({
        storeClient: this.redis,
        keyPrefix: `${keyPrefix}:register`,
        points: registerPoints,
        duration,
      }),
      email_verification_request: new RateLimiterRedis({
        storeClient: this.redis,
        keyPrefix: `${keyPrefix}:email-verification-request`,
        points: lifecycleRequestPoints,
        duration,
      }),
      email_verification_confirm: new RateLimiterRedis({
        storeClient: this.redis,
        keyPrefix: `${keyPrefix}:email-verification-confirm`,
        points: lifecycleConfirmPoints,
        duration,
      }),
      password_reset_request: new RateLimiterRedis({
        storeClient: this.redis,
        keyPrefix: `${keyPrefix}:password-reset-request`,
        points: lifecycleRequestPoints,
        duration,
      }),
      password_reset_confirm: new RateLimiterRedis({
        storeClient: this.redis,
        keyPrefix: `${keyPrefix}:password-reset-confirm`,
        points: lifecycleConfirmPoints,
        duration,
      }),
    };
  }

  async consume(endpoint: AuthRateLimitEndpoint, clientIp: string): Promise<void> {
    try {
      await this.redisReady;
      await this.limiters[endpoint].consume(clientIp || 'unknown');
    } catch (error) {
      if (this.isRateLimiterResult(error)) {
        const retryAfter = Math.max(1, Math.ceil(error.msBeforeNext / 1000));
        this.metrics.authRateLimitRejections.inc({ endpoint });
        throw new AuthRateLimitExceededException(retryAfter);
      }
      throw new ServiceUnavailableException('Authentication protection is temporarily unavailable.');
    }
  }

  private isRateLimiterResult(value: unknown): value is RateLimiterRes {
    return typeof value === 'object' && value !== null && 'msBeforeNext' in value;
  }

  onModuleDestroy(): void {
    if (this.redis.status !== 'end') this.redis.disconnect();
  }
}
