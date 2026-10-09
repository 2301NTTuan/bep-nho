import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CurrentUserService } from '../identity/current-user.service';
import { SESSION_LAST_USED_WRITE_INTERVAL_MS, SESSION_TTL_MS } from './auth.constants';
import type { AuthenticatedIdentity } from './auth.types';
import { PasswordService } from './password.service';
import { AccountLifecycleService } from './account-lifecycle.service';
import { createOpaqueToken, hashOpaqueToken } from './opaque-token';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashSessionToken(token: string): string {
  return hashOpaqueToken(token);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly currentUser: CurrentUserService,
    private readonly lifecycle: AccountLifecycleService,
  ) {}

  async register(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);
    const passwordHash = await this.passwords.hash(password);

    let user: { id: string };
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { authSubject: `local:${randomUUID()}` },
          select: { id: true },
        });
        await tx.userCredential.create({
          data: { userId: created.id, normalizedEmail, passwordHash },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email is already registered.');
      }
      throw error;
    }

    await this.lifecycle.requestEmailVerification(normalizedEmail);
    return this.establishSession(user.id);
  }

  async login(email: string, password: string) {
    const credential = await this.prisma.userCredential.findUnique({
      where: { normalizedEmail: normalizeEmail(email) },
      include: { user: true },
    });

    const validPassword = credential
      ? await this.passwords.verify(password, credential.passwordHash)
      : (await this.passwords.consumeDummyVerification(password), false);

    if (!credential || !validPassword || credential.user.status !== 'active') {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.establishSession(credential.userId);
  }

  async establishSession(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, status: 'active' },
      select: { id: true },
    });
    if (!user) {
      throw new UnauthorizedException('Authentication required.');
    }

    const token = createOpaqueToken().raw;
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await this.prisma.authSession.create({
      data: { userId, tokenHash: hashSessionToken(token), expiresAt },
    });

    return {
      token,
      expiresAt,
      context: await this.currentUser.resolveById(userId),
    };
  }

  async authenticate(token: string): Promise<AuthenticatedIdentity | null> {
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: { select: { status: true } } },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.status !== 'active'
    ) {
      return null;
    }

    if (
      !session.lastUsedAt ||
      Date.now() - session.lastUsedAt.getTime() >= SESSION_LAST_USED_WRITE_INTERVAL_MS
    ) {
      await this.prisma.authSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { lastUsedAt: new Date() },
      });
    }

    return { userId: session.userId, sessionId: session.id };
  }

  async revoke(token: string | null): Promise<void> {
    if (!token) return;
    await this.prisma.authSession.updateMany({
      where: { tokenHash: hashSessionToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
