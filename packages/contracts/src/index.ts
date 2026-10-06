export type ApiError = { code: string; message: string; request_id: string; details?: unknown };
export type ApiEnvelope<T> = { data: T; meta?: { request_id?: string; next_cursor?: string | null } };
