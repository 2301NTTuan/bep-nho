const DEFAULT_API_BASE =
  'http://localhost:3001/v1';

export const API_BASE =
  process.env
    .NEXT_PUBLIC_API_BASE_URL ??
  DEFAULT_API_BASE;

export class ApiRequestError
  extends Error {
  readonly status: number;

  readonly body:
    unknown;

  constructor(
    status: number,
    message: string,
    body: unknown,
  ) {
    super(message);

    this.name =
      'ApiRequestError';

    this.status =
      status;

    this.body =
      body;
  }
}

export function getErrorMessage(
  cause: unknown,
  fallback: string,
): string {
  if (cause instanceof ApiRequestError) {
    const body = cause.body as { message?: string; error?: { message?: string } } | null;
    return body?.error?.message ?? body?.message ?? fallback;
  }

  return cause instanceof Error && cause.message !== 'Failed to fetch'
    ? cause.message
    : fallback;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response =
    await fetch(
      `${API_BASE}${path}`,
      {
        ...init,

        headers: {
          accept:
            'application/json',

          ...(init?.body
            ? {
                'content-type':
                  'application/json',
              }
            : {}),

          ...init?.headers,
        },
      },
    );

  let body:
    unknown = null;

  try {
    body =
      await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new ApiRequestError(
      response.status,

      `API request failed: ${response.status}`,

      body,
    );
  }

  return body as T;
}
