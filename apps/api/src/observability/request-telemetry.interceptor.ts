import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import type { Logger } from 'pino';
import { catchError, finalize, Observable, throwError } from 'rxjs';
import { resolveRequestId, type RequestWithId } from '../http/request-id';
import { MetricsService } from './metrics.service';

type TelemetryRequest = RequestWithId & {
  method: string;
  baseUrl?: string;
  route?: { path?: string };
};

@Injectable()
export class RequestTelemetryInterceptor implements NestInterceptor {
  constructor(
    private readonly metrics: MetricsService,
    private readonly logger: Logger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<TelemetryRequest>();
    const response = http.getResponse<{ statusCode: number }>();
    const requestId = resolveRequestId(request);
    const started = process.hrtime.bigint();
    let finalStatus: number | null = null;

    return next.handle().pipe(
      catchError((error: unknown) => {
        finalStatus = error instanceof HttpException ? error.getStatus() : 500;
        return throwError(() => error);
      }),
      finalize(() => {
        const durationSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
        const routePath = request.route?.path;
        const route = routePath ? `${request.baseUrl ?? ''}${routePath}` : 'unmatched';
        const status = finalStatus ?? response.statusCode;
        const statusClass = `${Math.floor(status / 100)}xx`;
        if (this.metrics.enabled()) {
          this.metrics.httpRequests.inc({ method: request.method, route, status_class: statusClass });
          this.metrics.httpDuration.observe(
            { method: request.method, route, status_class: statusClass },
            durationSeconds,
          );
        }
        this.logger.info({
          requestId,
          method: request.method,
          route,
          status,
          durationMs: Math.round(durationSeconds * 1000),
        }, 'HTTP request completed');
      }),
    );
  }
}
