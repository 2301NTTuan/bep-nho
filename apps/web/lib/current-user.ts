import { apiRequest } from './api';
import type { CurrentUserContext, CurrentUserResponse } from '@bep-nho/contracts';

export type { CurrentUserContext } from '@bep-nho/contracts';

export interface CurrentUserProvider {
  load(): Promise<CurrentUserContext>;
}

class SessionCurrentUserProvider implements CurrentUserProvider {
  async load(): Promise<CurrentUserContext> {
    const response = await apiRequest<CurrentUserResponse>('/me');
    return response.data;
  }
}

const provider: CurrentUserProvider = new SessionCurrentUserProvider();

export function loadCurrentUser(): Promise<CurrentUserContext> {
  return provider.load();
}

export async function establishDevelopmentSession(): Promise<CurrentUserContext> {
  const response = await apiRequest<CurrentUserResponse>('/dev/session', { method: 'POST' });
  return response.data;
}

export async function logoutCurrentUser(): Promise<void> {
  await apiRequest('/auth/logout', { method: 'POST' });
}
