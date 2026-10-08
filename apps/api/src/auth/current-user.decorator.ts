import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedIdentity, AuthenticatedRequest } from './auth.types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedIdentity => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.authenticatedIdentity as AuthenticatedIdentity;
  },
);
