import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
} from './auth.constants';
import { MailDeliveryService } from './mail-delivery.service';
import { createOpaqueToken, hashOpaqueToken } from './opaque-token';
import { PasswordService } from './password.service';
import { AccountLifecycleLockService } from './account-lifecycle-lock.service';

const GENERIC_REQUEST_RESULT = { accepted: true } as const;

@Injectable()
export class AccountLifecycleService {
  private readonly logger = new Logger(AccountLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mail: MailDeliveryService,
    private readonly lifecycleLock: AccountLifecycleLockService,
  ) {}

  async requestEmailVerification(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const credential = await this.prisma.userCredential.findUnique({
      where: { normalizedEmail },
      include: { user: { select: { status: true } } },
    });
    if (credential && credential.user.status === 'active' && !credential.emailVerifiedAt) {
      const token = createOpaqueToken();
      await this.prisma.$transaction(async (tx) => {
        await this.lifecycleLock.acquire(tx, credential.userId, 'email_verification_request');
        await tx.emailVerificationToken.updateMany({
          where: { userId: credential.userId, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.emailVerificationToken.create({
          data: {
            userId: credential.userId,
            tokenHash: token.hash,
            expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
          },
        });
      });
      await this.deliverSafely(() => this.mail.sendVerification(normalizedEmail, token.raw));
      this.logger.log('Account lifecycle event: verification requested');
    }
    return GENERIC_REQUEST_RESULT;
  }

  async confirmEmailVerification(rawToken: string) {
    const token = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashOpaqueToken(rawToken) },
      select: { id: true, userId: true },
    });
    if (!token) throw new BadRequestException('Invalid or expired verification token.');

    const verifiedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.lifecycleLock.acquire(tx, token.userId, 'email_verification_confirm');
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: verifiedAt } },
        data: { usedAt: verifiedAt },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException('Invalid or expired verification token.');
      }
      await tx.userCredential.update({
        where: { userId: token.userId },
        data: { emailVerifiedAt: verifiedAt },
      });
      await tx.emailVerificationToken.updateMany({
        where: { userId: token.userId, usedAt: null },
        data: { usedAt: verifiedAt },
      });
    });
    this.logger.log('Account lifecycle event: verification completed');
    return { verified: true, emailVerifiedAt: verifiedAt.toISOString() };
  }

  async requestPasswordReset(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const credential = await this.prisma.userCredential.findUnique({
      where: { normalizedEmail },
      include: { user: { select: { status: true } } },
    });
    if (credential && credential.user.status === 'active') {
      const token = createOpaqueToken();
      await this.prisma.$transaction(async (tx) => {
        await this.lifecycleLock.acquire(tx, credential.userId, 'password_reset_request');
        await tx.passwordResetToken.updateMany({
          where: { userId: credential.userId, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.passwordResetToken.create({
          data: {
            userId: credential.userId,
            tokenHash: token.hash,
            expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
          },
        });
      });
      await this.deliverSafely(() => this.mail.sendPasswordReset(normalizedEmail, token.raw));
      this.logger.log('Account lifecycle event: password reset requested');
    }
    return GENERIC_REQUEST_RESULT;
  }

  async confirmPasswordReset(rawToken: string, newPassword: string) {
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashOpaqueToken(rawToken) },
      select: { id: true, userId: true },
    });
    if (!token) throw new BadRequestException('Invalid or expired reset token.');
    const passwordHash = await this.passwords.hash(newPassword);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.lifecycleLock.acquire(tx, token.userId, 'password_reset_confirm');
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new BadRequestException('Invalid or expired reset token.');
      await tx.userCredential.update({ where: { userId: token.userId }, data: { passwordHash } });
      await tx.passwordResetToken.updateMany({
        where: { userId: token.userId, usedAt: null },
        data: { usedAt: now },
      });
      await tx.authSession.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now },
      });
    });
    this.logger.log('Account lifecycle event: password reset completed; all sessions revoked');
    return { passwordReset: true, loginRequired: true };
  }

  async changePassword(userId: string, currentSessionId: string, currentPassword: string, newPassword: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lifecycleLock.acquire(tx, userId, 'password_change');
      const credential = await tx.userCredential.findUnique({ where: { userId } });
      if (!credential || !(await this.passwords.verify(currentPassword, credential.passwordHash))) {
        throw new UnauthorizedException('Current password is incorrect.');
      }
      if (await this.passwords.verify(newPassword, credential.passwordHash)) {
        throw new BadRequestException('New password must be different from the current password.');
      }
      const passwordHash = await this.passwords.hash(newPassword);
      await tx.userCredential.update({ where: { userId }, data: { passwordHash } });
      const revoked = await tx.authSession.updateMany({
        where: { userId, id: { not: currentSessionId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      this.logger.log('Account lifecycle event: password changed; other sessions revoked');
      return { passwordChanged: true, revokedOtherSessions: revoked.count };
    });
  }

  async listSessions(userId: string, currentSessionId: string) {
    const now = new Date();
    const sessions = await this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, createdAt: true, lastUsedAt: true, expiresAt: true },
    });
    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt?.toISOString() ?? null,
      expiresAt: session.expiresAt.toISOString(),
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, currentSessionId: string, sessionId: string) {
    const session = await this.prisma.authSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException('Session was not found.');
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logger.log('Account lifecycle event: session revoked');
    return { revoked: true, currentSessionRevoked: sessionId === currentSessionId };
  }

  async revokeOtherSessions(userId: string, currentSessionId: string) {
    const result = await this.prisma.authSession.updateMany({
      where: { userId, id: { not: currentSessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    this.logger.log('Account lifecycle event: other sessions revoked');
    return { revoked: result.count };
  }

  async deleteAccount(userId: string, password: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lifecycleLock.acquire(tx, userId, 'account_delete');
      const credential = await tx.userCredential.findUnique({ where: { userId } });
      if (!credential || !(await this.passwords.verify(password, credential.passwordHash))) {
        throw new UnauthorizedException('Password confirmation failed.');
      }
      await tx.user.delete({ where: { id: userId } });
    });
    this.logger.log('Account lifecycle event: account and user-owned data deleted');
    return { deleted: true };
  }

  private async deliverSafely(delivery: () => Promise<void>): Promise<void> {
    try {
      await delivery();
    } catch {
      this.logger.warn('Account lifecycle mail delivery failed');
    }
  }
}
