import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESSION_COOKIE_NAME, SESSION_TTL_MS } from './auth.constants';
import type { CookieResponse } from './auth.types';

export function readCookie(
  cookieHeader: string | string[] | undefined,
  name: string,
): string | null {
  const header = Array.isArray(cookieHeader) ? cookieHeader.join(';') : cookieHeader;

  if (!header) {
    return null;
  }

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) {
      continue;
    }

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

@Injectable()
export class SessionCookieService {
  constructor(private readonly config: ConfigService) {}

  private attributes(expiresAt: Date, maxAgeSeconds: number): string[] {
    const secure = this.config.get<string>('NODE_ENV', 'development') === 'production';

    return [
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${maxAgeSeconds}`,
      `Expires=${expiresAt.toUTCString()}`,
      ...(secure ? ['Secure'] : []),
    ];
  }

  set(response: CookieResponse, token: string, expiresAt: Date): void {
    response.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; ${this.attributes(
        expiresAt,
        Math.floor(SESSION_TTL_MS / 1000),
      ).join('; ')}`,
    );
  }

  clear(response: CookieResponse): void {
    response.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE_NAME}=; ${this.attributes(new Date(0), 0).join('; ')}`,
    );
  }
}
