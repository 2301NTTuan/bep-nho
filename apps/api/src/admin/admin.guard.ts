import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedRequest } from '../auth/auth.types';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.authenticatedIdentity?.userId;
    const user = userId
      ? await this.prisma.user.findFirst({
          where: { id: userId, status: 'active' },
          select: { role: true },
        })
      : null;
    if (!user || user.role !== 'admin') throw new ForbiddenException('Administrator access required.');
    return true;
  }
}
