import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';
export const REQUEST_ID_MAX_LENGTH = 64;
const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

export type RequestWithId = {
  headers: Record<string, string | string[] | undefined>;
  requestId?: string;
};

export function safeRequestId(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && candidate.length <= REQUEST_ID_MAX_LENGTH && SAFE_REQUEST_ID.test(candidate)
    ? candidate
    : randomUUID();
}

export function resolveRequestId(request: RequestWithId): string {
  if (request.requestId) return request.requestId;
  const requestId = safeRequestId(request.headers[REQUEST_ID_HEADER]);
  request.requestId = requestId;
  return requestId;
}
