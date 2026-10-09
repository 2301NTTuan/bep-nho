import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { resolveRequestId, type RequestWithId } from './request-id';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<{ setHeader(name: string, value: string): void }>();
    const requestId = resolveRequestId(request);
    response.setHeader('X-Request-ID', requestId);

    return next.handle().pipe(map((body: unknown) => {
      if (typeof body !== 'object' || body === null || !('data' in body)) return body;
      const envelope = body as { data: unknown; meta?: Record<string, unknown> };
      return { ...envelope, meta: { ...envelope.meta, requestId } };
    }));
  }
}
