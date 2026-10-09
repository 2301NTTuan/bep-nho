import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiCookieAuth, ApiResponse } from '@nestjs/swagger';

const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string', example: 'VALIDATION_ERROR' },
        message: { type: 'string' },
        requestId: { type: 'string', maxLength: 64 },
        details: { type: 'array', items: { type: 'string' } },
      },
    },
  },
};

export function ApiStandardErrors(...statuses: number[]) {
  return applyDecorators(...statuses.map((status) => ApiResponse({
    status,
    description: HttpStatus[status] ?? 'HTTP error',
    schema: errorSchema,
  })));
}

export function ApiSessionProtected() {
  return applyDecorators(
    ApiCookieAuth('sessionCookie'),
    ApiStandardErrors(401, 403),
  );
}
