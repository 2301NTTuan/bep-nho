import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly httpRequests: Counter<'method' | 'route' | 'status_class'>;
  readonly httpDuration: Histogram<'method' | 'route' | 'status_class'>;
  readonly authRateLimitRejections: Counter<'endpoint'>;

  constructor(private readonly config: ConfigService) {
    collectDefaultMetrics({ register: this.registry, prefix: 'bep_nho_' });
    this.httpRequests = new Counter({
      name: 'bep_nho_http_requests_total',
      help: 'Completed HTTP requests.',
      labelNames: ['method', 'route', 'status_class'],
      registers: [this.registry],
    });
    this.httpDuration = new Histogram({
      name: 'bep_nho_http_request_duration_seconds',
      help: 'HTTP request duration in seconds.',
      labelNames: ['method', 'route', 'status_class'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
    this.authRateLimitRejections = new Counter({
      name: 'bep_nho_auth_rate_limit_rejections_total',
      help: 'Rejected authentication requests.',
      labelNames: ['endpoint'],
      registers: [this.registry],
    });
  }

  enabled(): boolean {
    return this.config.get<boolean>('METRICS_ENABLED', true);
  }
}
