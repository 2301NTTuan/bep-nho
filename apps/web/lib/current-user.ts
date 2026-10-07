import { apiRequest } from './api';
import type { CurrentUserContext, CurrentUserResponse } from '@bep-nho/contracts';

export type { CurrentUserContext } from '@bep-nho/contracts';

export interface CurrentUserProvider {
  load(): Promise<CurrentUserContext>;
}

class DevelopmentCurrentUserProvider implements CurrentUserProvider {
  async load(): Promise<CurrentUserContext> {
    const response = await apiRequest<CurrentUserResponse>('/dev/bootstrap');
    return response.data;
  }
}

class UnconfiguredCurrentUserProvider implements CurrentUserProvider {
  async load(): Promise<CurrentUserContext> {
    throw new Error('Đăng nhập chưa được cấu hình cho môi trường này.');
  }
}

const provider: CurrentUserProvider =
  process.env.NODE_ENV === 'production'
    ? new UnconfiguredCurrentUserProvider()
    : new DevelopmentCurrentUserProvider();

export function loadCurrentUser(): Promise<CurrentUserContext> {
  return provider.load();
}
