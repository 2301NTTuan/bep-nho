import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorEnvelope } from '@bep-nho/contracts';

const ERROR_CODES: Partial<Record<number, string>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const response = context.getResponse<{
      setHeader(name: string, value: string): void;
      status(code: number): { json(body: ApiErrorEnvelope): void };
    }>();

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    const rawObject = typeof raw === 'object' && raw !== null
      ? raw as { message?: string | string[]; error?: string }
      : null;
    const validationDetails = Array.isArray(rawObject?.message) ? rawObject.message : undefined;
    const exceptionMessage = typeof rawObject?.message === 'string' ? rawObject.message : undefined;
    const message = status === HttpStatus.INTERNAL_SERVER_ERROR
      ? 'An unexpected error occurred.'
      : validationDetails
        ? 'Request validation failed.'
        : typeof raw === 'string'
          ? raw
          : exceptionMessage ?? (exception instanceof Error
            ? exception.message
            : 'Request failed.');
    const incomingId = request.headers['x-request-id'];
    const requestId = (Array.isArray(incomingId) ? incomingId[0] : incomingId) || randomUUID();

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    response.setHeader('X-Request-ID', requestId);
    response.status(status).json({
      error: {
        code: ERROR_CODES[status] ?? 'INTERNAL_ERROR',
        message,
        requestId,
        ...(validationDetails ? { details: validationDetails } : {}),
      },
    });
  }
}
