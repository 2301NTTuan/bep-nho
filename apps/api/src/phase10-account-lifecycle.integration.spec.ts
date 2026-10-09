import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';
import { configureHttp } from './http/configure-http';
import { hashSessionToken } from './auth/auth.service';
import {
  AccountLifecycleLockService,
  type AccountLifecycleLockOperation,
  type AccountLifecycleLockPhase,
} from './auth/account-lifecycle-lock.service';

const ORIGIN = 'http://localhost:3000';
const OLD_PASSWORD = 'Phase10-old-password!';
const NEW_PASSWORD = 'Phase10-new-password!';

type JsonBody = {
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
  error?: { code?: string; message?: string };
};

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('Phase 10 account lifecycle (HTTP integration)', () => {
  const runId = randomUUID().replace(/-/g, '');
  const emailPrefix = `phase10-${runId}`;
  const recipeIds: string[] = [];
  const ingredientIds: string[] = [];
  let app: INestApplication;
  let prisma: PrismaService;
  let lifecycleLock: AccountLifecycleLockService;
  let base: string;

  async function request(
    path: string,
    init: RequestInit & { cookie?: string; origin?: string | null } = {},
  ): Promise<Response> {
    const { cookie, origin = ORIGIN, ...fetchInit } = init;
    const headers = new Headers(fetchInit.headers);
    if (cookie) headers.set('cookie', cookie);
    if (origin) headers.set('origin', origin);
    if (fetchInit.body) headers.set('content-type', 'application/json');
    return fetch(`${base}${path}`, { ...fetchInit, headers });
  }

  async function json(response: Response): Promise<JsonBody> {
    return await response.json() as JsonBody;
  }

  function cookieFrom(response: Response): string {
    const value = response.headers.get('set-cookie');
    if (!value) throw new Error('Expected session cookie');
    return value.split(';', 1)[0];
  }

  function rawTokenFromCookie(cookie: string): string {
    return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  }

  async function register(label: string, password = OLD_PASSWORD) {
    const email = `${emailPrefix}-${label}@example.com`;
    const response = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const body = await json(response);
    expect(response.status).toBe(201);
    const context = body.data as { user: { id: string; emailVerified: boolean } };
    expect(context.user.emailVerified).toBe(false);
    return { email, userId: context.user.id, cookie: cookieFrom(response) };
  }

  async function login(email: string, password = OLD_PASSWORD) {
    return request('/auth/login', {
      method: 'POST', body: JSON.stringify({ email, password }),
    });
  }

  async function latestMail(email: string, type: 'email_verification' | 'password_reset') {
    const response = await request(
      `/dev/mail-outbox/latest?email=${encodeURIComponent(email)}&type=${type}`,
      { origin: null, headers: { 'X-Dev-Mail-Outbox-Key': 'test-only-outbox-key' } },
    );
    expect(response.status).toBe(200);
    return (await json(response)).data as { token: string; url: string; type: string; email: string };
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    const config = app.get(ConfigService);
    configureHttp(app, config);
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    lifecycleLock = app.get(AccountLifecycleLockService);
    const address = app.getHttpServer().address() as { port: number };
    base = `http://127.0.0.1:${address.port}/v1`;
  });

  afterAll(async () => {
    lifecycleLock.setTestHook(null);
    const credentials = await prisma.userCredential.findMany({
      where: { normalizedEmail: { startsWith: emailPrefix } },
      select: { userId: true },
    });
    await prisma.user.deleteMany({ where: { id: { in: credentials.map(({ userId }) => userId) } } });
    await prisma.recipe.deleteMany({ where: { id: { in: recipeIds } } });
    await prisma.ingredient.deleteMany({ where: { id: { in: ingredientIds } } });
    await app.close();
  });

  afterEach(() => lifecycleLock.setTestHook(null));

  it('hashes, expires, reissues, and consumes email verification tokens once', async () => {
    const account = await register('verify');
    const initialMail = await latestMail(account.email, 'email_verification');
    const initialHash = createHash('sha256').update(initialMail.token).digest('hex');
    const initialRecord = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: initialHash },
    });
    expect(initialRecord).not.toBeNull();
    expect(initialRecord?.tokenHash).not.toBe(initialMail.token);
    expect(JSON.stringify(initialRecord)).not.toContain(initialMail.token);

    const [known, unknown] = await Promise.all([
      request('/auth/email-verification/request', {
        method: 'POST', body: JSON.stringify({ email: account.email }),
      }),
      request('/auth/email-verification/request', {
        method: 'POST', body: JSON.stringify({ email: `${emailPrefix}-unknown@example.com` }),
      }),
    ]);
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect((await json(known)).data).toEqual((await json(unknown)).data);

    const reissued = await latestMail(account.email, 'email_verification');
    expect(reissued.token).not.toBe(initialMail.token);
    expect((await request('/auth/email-verification/confirm', {
      method: 'POST', body: JSON.stringify({ token: initialMail.token }),
    })).status).toBe(400);

    const reissuedHash = createHash('sha256').update(reissued.token).digest('hex');
    await prisma.emailVerificationToken.update({
      where: { tokenHash: reissuedHash }, data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect((await request('/auth/email-verification/confirm', {
      method: 'POST', body: JSON.stringify({ token: reissued.token }),
    })).status).toBe(400);

    await request('/auth/email-verification/request', {
      method: 'POST', body: JSON.stringify({ email: account.email }),
    });
    const usable = await latestMail(account.email, 'email_verification');
    const confirmed = await request('/auth/email-verification/confirm', {
      method: 'POST', body: JSON.stringify({ token: usable.token }),
    });
    expect(confirmed.status).toBe(200);
    expect((await json(confirmed)).data).toMatchObject({ verified: true });
    expect((await request('/auth/email-verification/confirm', {
      method: 'POST', body: JSON.stringify({ token: usable.token }),
    })).status).toBe(400);
    expect((await request('/auth/email-verification/confirm', {
      method: 'POST', body: JSON.stringify({ token: randomBytes(32).toString('base64url') }),
    })).status).toBe(400);
    expect((await request('/auth/email-verification/confirm', {
      method: 'POST', body: JSON.stringify({ token: 'malformed' }),
    })).status).toBe(400);

    const me = await request('/me', { cookie: account.cookie });
    expect((await json(me)).data).toMatchObject({
      user: { email: account.email, emailVerified: true },
    });
  });

  it('resets passwords atomically, revokes every session, and resists enumeration', async () => {
    const account = await register('reset');
    const secondLogin = await login(account.email);
    expect(secondLogin.status).toBe(200);
    const secondCookie = cookieFrom(secondLogin);

    const [known, unknown] = await Promise.all([
      request('/auth/password-reset/request', {
        method: 'POST', body: JSON.stringify({ email: account.email }),
      }),
      request('/auth/password-reset/request', {
        method: 'POST', body: JSON.stringify({ email: `${emailPrefix}-missing@example.com` }),
      }),
    ]);
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect((await json(known)).data).toEqual((await json(unknown)).data);

    const expiring = await latestMail(account.email, 'password_reset');
    const expiringHash = createHash('sha256').update(expiring.token).digest('hex');
    const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash: expiringHash } });
    expect(stored).not.toBeNull();
    expect(JSON.stringify(stored)).not.toContain(expiring.token);
    await prisma.passwordResetToken.update({
      where: { tokenHash: expiringHash }, data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect((await request('/auth/password-reset/confirm', {
      method: 'POST', body: JSON.stringify({ token: expiring.token, newPassword: NEW_PASSWORD }),
    })).status).toBe(400);

    await request('/auth/password-reset/request', {
      method: 'POST', body: JSON.stringify({ email: account.email }),
    });
    const usable = await latestMail(account.email, 'password_reset');
    const attempts = await Promise.all([
      request('/auth/password-reset/confirm', {
        method: 'POST', body: JSON.stringify({ token: usable.token, newPassword: NEW_PASSWORD }),
      }),
      request('/auth/password-reset/confirm', {
        method: 'POST', body: JSON.stringify({ token: usable.token, newPassword: NEW_PASSWORD }),
      }),
    ]);
    expect(attempts.map(({ status }) => status).sort()).toEqual([200, 400]);
    expect((await request('/me', { cookie: account.cookie })).status).toBe(401);
    expect((await request('/me', { cookie: secondCookie })).status).toBe(401);
    expect((await login(account.email, OLD_PASSWORD)).status).toBe(401);
    expect((await login(account.email, NEW_PASSWORD)).status).toBe(200);
    expect((await request('/auth/password-reset/confirm', {
      method: 'POST', body: JSON.stringify({ token: usable.token, newPassword: OLD_PASSWORD }),
    })).status).toBe(400);
  });

  it('serializes an old-password login with password reset under a controlled barrier', async () => {
    const account = await register('reset-race');
    await request('/auth/password-reset/request', {
      method: 'POST', body: JSON.stringify({ email: account.email }),
    });
    const resetMail = await latestMail(account.email, 'password_reset');
    const loginHasLock = deferred();
    const releaseLogin = deferred();
    const resetReachedLock = deferred();

    lifecycleLock.setTestHook(async (
      phase: AccountLifecycleLockPhase,
      operation: AccountLifecycleLockOperation,
      userId: string,
    ) => {
      if (userId !== account.userId) return;
      if (phase === 'acquired' && operation === 'login') {
        loginHasLock.resolve();
        await releaseLogin.promise;
      }
      if (phase === 'before_acquire' && operation === 'password_reset_confirm') {
        resetReachedLock.resolve();
      }
    });

    const racingLoginPromise = login(account.email, OLD_PASSWORD);
    await loginHasLock.promise;
    const resetPromise = request('/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify({ token: resetMail.token, newPassword: NEW_PASSWORD }),
    });
    await resetReachedLock.promise;
    releaseLogin.resolve();

    const [racingLogin, reset] = await Promise.all([racingLoginPromise, resetPromise]);
    lifecycleLock.setTestHook(null);
    expect(racingLogin.status).toBe(200);
    expect(reset.status).toBe(200);
    const racingCookie = cookieFrom(racingLogin);
    expect((await request('/me', { cookie: racingCookie })).status).toBe(401);
    expect((await login(account.email, OLD_PASSWORD)).status).toBe(401);
    expect((await login(account.email, NEW_PASSWORD)).status).toBe(200);
    expect(await prisma.authSession.count({
      where: { userId: account.userId, revokedAt: null },
    })).toBe(1);
  });

  it('serializes an old-password login with password change under a controlled barrier', async () => {
    const account = await register('change-race');
    const loginHasLock = deferred();
    const releaseLogin = deferred();
    const changeReachedLock = deferred();

    lifecycleLock.setTestHook(async (
      phase: AccountLifecycleLockPhase,
      operation: AccountLifecycleLockOperation,
      userId: string,
    ) => {
      if (userId !== account.userId) return;
      if (phase === 'acquired' && operation === 'login') {
        loginHasLock.resolve();
        await releaseLogin.promise;
      }
      if (phase === 'before_acquire' && operation === 'password_change') {
        changeReachedLock.resolve();
      }
    });

    const racingLoginPromise = login(account.email, OLD_PASSWORD);
    await loginHasLock.promise;
    const changePromise = request('/me/password', {
      method: 'POST',
      cookie: account.cookie,
      body: JSON.stringify({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }),
    });
    await changeReachedLock.promise;
    releaseLogin.resolve();

    const [racingLogin, change] = await Promise.all([racingLoginPromise, changePromise]);
    lifecycleLock.setTestHook(null);
    expect(racingLogin.status).toBe(200);
    expect(change.status).toBe(200);
    expect((await request('/me', { cookie: cookieFrom(racingLogin) })).status).toBe(401);
    expect((await request('/me', { cookie: account.cookie })).status).toBe(200);
    expect((await login(account.email, OLD_PASSWORD)).status).toBe(401);
    expect((await login(account.email, NEW_PASSWORD)).status).toBe(200);
    expect(await prisma.authSession.count({
      where: {
        userId: account.userId,
        revokedAt: null,
        tokenHash: { not: hashSessionToken(rawTokenFromCookie(account.cookie)) },
      },
    })).toBe(1);
  });

  it('prevents session creation after concurrent account deletion', async () => {
    const account = await register('delete-race');
    const deletionHasLock = deferred();
    const releaseDeletion = deferred();
    const loginReachedLock = deferred();

    lifecycleLock.setTestHook(async (
      phase: AccountLifecycleLockPhase,
      operation: AccountLifecycleLockOperation,
      userId: string,
    ) => {
      if (userId !== account.userId) return;
      if (phase === 'acquired' && operation === 'account_delete') {
        deletionHasLock.resolve();
        await releaseDeletion.promise;
      }
      if (phase === 'before_acquire' && operation === 'login') {
        loginReachedLock.resolve();
      }
    });

    const deletionPromise = request('/me/account', {
      method: 'DELETE',
      cookie: account.cookie,
      body: JSON.stringify({ password: OLD_PASSWORD, confirm: 'DELETE' }),
    });
    await deletionHasLock.promise;
    const racingLoginPromise = login(account.email, OLD_PASSWORD);
    await loginReachedLock.promise;
    releaseDeletion.resolve();

    const [deletion, racingLogin] = await Promise.all([deletionPromise, racingLoginPromise]);
    lifecycleLock.setTestHook(null);
    expect(deletion.status).toBe(200);
    expect(racingLogin.status).toBe(401);
    expect(await prisma.user.count({ where: { id: account.userId } })).toBe(0);
    expect(await prisma.authSession.count({ where: { userId: account.userId } })).toBe(0);
  });

  it('lists only safe owned session metadata, enforces ownership, and changes passwords safely', async () => {
    const account = await register('sessions');
    const currentLogin = await login(account.email);
    const currentCookie = cookieFrom(currentLogin);
    const otherLogin = await login(account.email);
    const otherCookie = cookieFrom(otherLogin);
    const foreign = await register('foreign-session');

    const list = await request('/me/sessions', { cookie: currentCookie });
    expect(list.status).toBe(200);
    const sessions = (await json(list)).data as Array<{
      id: string; current: boolean; createdAt: string; lastUsedAt: string | null; expiresAt: string;
    }>;
    expect(sessions).toHaveLength(3);
    expect(JSON.stringify(sessions)).not.toContain('tokenHash');
    expect(JSON.stringify(sessions)).not.toContain('token_hash');
    const current = sessions.find((session) => session.current);
    const originalSession = await prisma.authSession.findUnique({
      where: { tokenHash: hashSessionToken(rawTokenFromCookie(account.cookie)) },
      select: { id: true },
    });
    expect(current).toBeDefined();
    expect(originalSession).not.toBeNull();

    const foreignList = await request('/me/sessions', { cookie: foreign.cookie });
    const foreignId = ((await json(foreignList)).data as Array<{ id: string }>)[0].id;
    expect((await request(`/me/sessions/${foreignId}`, {
      method: 'DELETE', cookie: currentCookie,
    })).status).toBe(404);

    expect((await request(`/me/sessions/${originalSession!.id}`, {
      method: 'DELETE', cookie: currentCookie,
    })).status).toBe(200);
    expect((await request('/me', { cookie: account.cookie })).status).toBe(401);
    expect((await request('/me', { cookie: currentCookie })).status).toBe(200);

    const currentId = current!.id;
    const recent = new Date(Date.now() - 30_000);
    await prisma.authSession.update({ where: { id: currentId }, data: { lastUsedAt: recent } });
    await request('/me', { cookie: currentCookie });
    expect((await prisma.authSession.findUnique({ where: { id: currentId } }))?.lastUsedAt?.getTime())
      .toBe(recent.getTime());
    const stale = new Date(Date.now() - 6 * 60 * 1_000);
    await prisma.authSession.update({ where: { id: currentId }, data: { lastUsedAt: stale } });
    await request('/me', { cookie: currentCookie });
    expect((await prisma.authSession.findUnique({ where: { id: currentId } }))!.lastUsedAt!.getTime())
      .toBeGreaterThan(stale.getTime());

    expect((await request('/me/sessions/revoke-others', {
      method: 'POST', cookie: currentCookie,
    })).status).toBe(200);
    expect((await request('/me', { cookie: otherCookie })).status).toBe(401);
    expect((await request('/me', { cookie: currentCookie })).status).toBe(200);

    const extraLogin = await login(account.email);
    const extraCookie = cookieFrom(extraLogin);
    expect((await request('/me/password', {
      method: 'POST', cookie: currentCookie,
      body: JSON.stringify({ currentPassword: 'wrong-password', newPassword: NEW_PASSWORD }),
    })).status).toBe(401);
    expect((await request('/me/password', {
      method: 'POST', cookie: currentCookie,
      body: JSON.stringify({ currentPassword: OLD_PASSWORD, newPassword: OLD_PASSWORD }),
    })).status).toBe(400);
    const changed = await request('/me/password', {
      method: 'POST', cookie: currentCookie,
      body: JSON.stringify({ currentPassword: OLD_PASSWORD, newPassword: NEW_PASSWORD }),
    });
    expect(changed.status).toBe(200);
    expect((await json(changed)).data).toMatchObject({ passwordChanged: true });
    expect((await request('/me', { cookie: currentCookie })).status).toBe(200);
    expect((await request('/me', { cookie: extraCookie })).status).toBe(401);
    expect((await login(account.email, OLD_PASSWORD)).status).toBe(401);
    expect((await login(account.email, NEW_PASSWORD)).status).toBe(200);
  });

  it('deletes all private account data transactionally while preserving canonical and foreign data', async () => {
    const account = await register('delete');
    const other = await register('delete-other');
    const recipe = await prisma.recipe.create({
      data: {
        slug: `phase10-recipe-${runId}`,
        canonicalTitle: 'Phase 10 canonical recipe',
        status: 'published',
        versions: {
          create: {
            versionNo: 1, servings: 2, contentHash: `phase10-${runId}`,
            publishedAt: new Date(), summary: 'Canonical data must survive account deletion.',
          },
        },
      },
      include: { versions: true },
    });
    recipeIds.push(recipe.id);
    const ingredient = await prisma.ingredient.create({
      data: { slug: `phase10-ingredient-${runId}`, canonicalName: 'Phase 10 ingredient' },
    });
    ingredientIds.push(ingredient.id);
    const canonicalVersion = recipe.versions[0];
    const profile = await prisma.tasteProfile.create({
      data: { userId: account.userId, algorithmVersion: 'taste-v1' },
    });
    await prisma.tasteDimension.create({
      data: { tasteProfileId: profile.id, dimensionKey: 'saltiness' },
    });
    const personalized = await prisma.personalizedRecipeVersion.create({
      data: {
        userId: account.userId, recipeId: recipe.id, baseRecipeVersionId: canonicalVersion.id,
        tasteProfileId: profile.id, versionNo: 1, algorithmVersion: 'phase10-test',
        contentHash: `phase10-personalized-${runId}`, adjustmentJson: [], snapshotJson: {},
      },
    });
    await prisma.personalizedAdjustmentDecision.create({
      data: {
        userId: account.userId, recipeId: recipe.id,
        sourcePersonalizedRecipeVersionId: personalized.id,
        resultPersonalizedRecipeVersionId: personalized.id,
        ingredientId: ingredient.id, action: 'ACCEPT',
      },
    });
    await prisma.userRecipePreference.create({
      data: {
        userId: account.userId, recipeId: recipe.id,
        bestPersonalizedRecipeVersionId: personalized.id,
      },
    });
    const cookSession = await prisma.cookSession.create({
      data: {
        userId: account.userId, recipeVersionId: canonicalVersion.id,
        personalizedRecipeVersionId: personalized.id, servings: 2,
        snapshotJson: { schemaVersion: 1 } as Prisma.InputJsonValue,
      },
    });
    await prisma.cookEvent.create({
      data: {
        id: randomUUID(), cookSessionId: cookSession.id, eventType: 'step_completed',
        clientSeq: 1, clientTime: new Date(), payload: { stepNo: 1 },
      },
    });
    const feedback = await prisma.cookFeedback.create({
      data: {
        cookSessionId: cookSession.id, dimensionJson: { saltiness: 0.2 }, technicalFlags: [],
      },
    });
    await prisma.tasteSignal.create({
      data: {
        tasteProfileId: profile.id, cookFeedbackId: feedback.id, dimensionKey: 'saltiness',
        signalValue: 0.2, sourceType: 'feedback', baseWeight: 1, qualityFactor: 1,
      },
    });
    await prisma.tasteControlEvent.create({
      data: { tasteProfileId: profile.id, dimensionKey: 'saltiness', action: 'manual_override_set', value: 0.3 },
    });

    expect((await request('/me/account', {
      method: 'DELETE', cookie: account.cookie,
      body: JSON.stringify({ password: 'incorrect-password', confirm: 'DELETE' }),
    })).status).toBe(401);
    expect(await prisma.user.count({ where: { id: account.userId } })).toBe(1);
    expect((await request('/me/account', {
      method: 'DELETE', cookie: account.cookie,
      body: JSON.stringify({ password: OLD_PASSWORD, confirm: 'NO' }),
    })).status).toBe(400);

    const deleted = await request('/me/account', {
      method: 'DELETE', cookie: account.cookie,
      body: JSON.stringify({ password: OLD_PASSWORD, confirm: 'DELETE' }),
    });
    expect(deleted.status).toBe(200);
    expect(deleted.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await request('/me', { cookie: account.cookie })).status).toBe(401);
    expect(await prisma.user.count({ where: { id: account.userId } })).toBe(0);
    expect(await prisma.userCredential.count({ where: { userId: account.userId } })).toBe(0);
    expect(await prisma.authSession.count({ where: { userId: account.userId } })).toBe(0);
    expect(await prisma.cookSession.count({ where: { userId: account.userId } })).toBe(0);
    expect(await prisma.tasteProfile.count({ where: { userId: account.userId } })).toBe(0);
    expect(await prisma.personalizedRecipeVersion.count({ where: { userId: account.userId } })).toBe(0);
    expect(await prisma.personalizedAdjustmentDecision.count({ where: { userId: account.userId } })).toBe(0);
    expect(await prisma.userRecipePreference.count({ where: { userId: account.userId } })).toBe(0);
    expect(await prisma.recipe.count({ where: { id: recipe.id } })).toBe(1);
    expect(await prisma.recipeVersion.count({ where: { id: canonicalVersion.id } })).toBe(1);
    expect(await prisma.user.count({ where: { id: other.userId } })).toBe(1);
    expect((await request('/me', { cookie: other.cookie })).status).toBe(200);
  });
});
