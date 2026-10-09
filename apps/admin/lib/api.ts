export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/v1';

export class AdminApiError extends Error {
  constructor(readonly status: number, readonly body: unknown) {
    super(`Admin API request failed: ${status}`);
  }
}

export async function adminApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(!isForm && init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw new AdminApiError(response.status, body);
  return body as T;
}

export function adminError(error: unknown): string {
  if (error instanceof AdminApiError) {
    const body = error.body as { error?: { message?: string } } | null;
    return body?.error?.message ?? `Yêu cầu thất bại (${error.status}).`;
  }
  return error instanceof Error ? error.message : 'Yêu cầu thất bại.';
}
