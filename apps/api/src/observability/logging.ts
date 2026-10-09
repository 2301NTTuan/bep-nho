import type { LoggerService } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import pino, { type Logger } from 'pino';

export function createOperationalLogger(config: ConfigService): Logger {
  return pino({
    name: 'bep-nho-api',
    level: config.get<string>('LOG_LEVEL', 'info'),
    enabled: config.get<string>('NODE_ENV', 'development') !== 'test',
    base: { service: 'bep-nho-api' },
  });
}

export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}
  log(message: unknown, context?: string): void { this.logger.info({ context }, String(message)); }
  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error({ context, ...(trace ? { trace } : {}) }, String(message));
  }
  warn(message: unknown, context?: string): void { this.logger.warn({ context }, String(message)); }
  debug(message: unknown, context?: string): void { this.logger.debug({ context }, String(message)); }
  verbose(message: unknown, context?: string): void { this.logger.trace({ context }, String(message)); }
  fatal(message: unknown, context?: string): void { this.logger.fatal({ context }, String(message)); }
}
