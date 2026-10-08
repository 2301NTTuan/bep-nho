import { createHash, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SessionCookieService } from './auth/cookies';
import { PrismaService } from './database/prisma.service';
import { configureHttp } from './http/configure-http';

const ALLOWED_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'BepNho-test-2026!';

type JsonResponse = {
  data?: {
    id?: string;
    user?: { id: string };
    [key: string]: unknown;
  };
  error?: { code: string; message: string };
};

describe('authentication, ownership, and origin boundaries (HTTP integration)', () => {
  const runId = randomUUID().replace(/-/g, '');
  const suiteStartedAt = new Date();
  const emailPrefix = `phase6-${runId}`;
  const slug = `phase6-recipe-${runId}`;
  const ingredientSlug = `phase6-ingredient-${runId}`;
  const userIds: string[] = [];
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  let recipeId: string;
  let ingredientId: string;

  function cookieFrom(response: Response): string {
    const header = response.headers.get('set-cookie');
    if (!header) throw new Error('Expected a session cookie');
    return header.split(';', 1)[0];
  }

  async function json(response: Response): Promise<JsonResponse> {
    return await response.json() as JsonResponse;
  }

  async function request(
    path: string,
    init: RequestInit & { cookie?: string; origin?: string | null } = {},
  ) {
    const { cookie, origin = ALLOWED_ORIGIN, ...fetchInit } = init;
    const headers = new Headers(fetchInit.headers);
    if (cookie) headers.set('cookie', cookie);
    if (origin) headers.set('origin', origin);
    if (fetchInit.body) headers.set('content-type', 'application/json');
    return fetch(`${base}${path}`, { ...fetchInit, headers });
  }

  async function register(label: string, email?: string) {
    const response = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: email ?? `${emailPrefix}-${label}@example.com`,
        password: PASSWORD,
      }),
    });
    const body = await json(response);
    if (response.status !== 201 || !body.data?.user?.id) {
      throw new Error(`Registration failed (${response.status}): ${JSON.stringify(body)}`);
    }
    userIds.push(body.data.user.id);
    return { response, body, userId: body.data.user.id, cookie: cookieFrom(response) };
  }

  async function login(email: string, password = PASSWORD) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttp(app, app.get(ConfigService));
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    base = `http://127.0.0.1:${address.port}/v1`;
    prisma = app.get(PrismaService);

    await prisma.user.upsert({
      where: { authSubject: 'dev-local-user' },
      update: { status: 'active' },
      create: { authSubject: 'dev-local-user' },
    });
    const ingredient = await prisma.ingredient.create({
      data: { slug: ingredientSlug, canonicalName: 'Gia vị kiểm thử auth' },
    });
    ingredientId = ingredient.id;
    const recipe = await prisma.recipe.create({
      data: { slug, canonicalTitle: 'Món kiểm thử auth', status: 'published' },
    });
    recipeId = recipe.id;
    const version = await prisma.recipeVersion.create({
      data: {
        recipeId,
        versionNo: 1,
        servings: 2,
        contentHash: randomUUID().replace(/-/g, ''),
        publishedAt: new Date(),
      },
    });
    await prisma.recipeIngredient.create({
      data: {
        recipeVersionId: version.id,
        ingredientId,
        quantity: 5,
        unit: 'g',
        sortOrder: 1,
      },
    });
    await prisma.recipeStep.create({
      data: { recipeVersionId: version.id, stepNo: 1, instruction: 'Nấu chín.' },
    });
  });

  afterAll(async () => {
    const testCredentials = await prisma.userCredential.findMany({
      where: { normalizedEmail: { startsWith: emailPrefix } },
      select: { userId: true },
    });
    const cleanupUserIds = [...new Set([...userIds, ...testCredentials.map(({ userId }) => userId)])];
    const profiles = await prisma.tasteProfile.findMany({
      where: { userId: { in: cleanupUserIds } },
      select: { id: true },
    });
    const profileIds = profiles.map(({ id }) => id);

    await prisma.authSession.deleteMany({
      where: {
        user: { authSubject: 'dev-local-user' },
        createdAt: { gte: suiteStartedAt },
      },
    });
    await prisma.tasteSignal.deleteMany({ where: { tasteProfileId: { in: profileIds } } });
    await prisma.cookFeedback.deleteMany({ where: { cookSession: { userId: { in: cleanupUserIds } } } });
    await prisma.cookEvent.deleteMany({ where: { cookSession: { userId: { in: cleanupUserIds } } } });
    await prisma.cookSession.deleteMany({ where: { userId: { in: cleanupUserIds } } });
    await prisma.personalizedRecipeVersion.deleteMany({ where: { userId: { in: cleanupUserIds } } });
    await prisma.tasteDimension.deleteMany({ where: { tasteProfileId: { in: profileIds } } });
    await prisma.tasteProfile.deleteMany({ where: { userId: { in: cleanupUserIds } } });
    await prisma.recipe.deleteMany({ where: { id: recipeId } });
    await prisma.ingredient.deleteMany({ where: { id: ingredientId } });
    await prisma.user.deleteMany({ where: { id: { in: cleanupUserIds } } });
    await app.close();
  });

  it('registers with normalized email and stores only password/session hashes', async () => {
    const rawEmail = `  ${emailPrefix}-Normalized@Example.COM  `;
    const registered = await register('normalized', rawEmail);
    const setCookie = registered.response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('bep_nho_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).not.toContain('Secure');

    const credential = await prisma.userCredential.findUniqueOrThrow({
      where: { normalizedEmail: `${emailPrefix}-normalized@example.com` },
    });
    expect(credential.passwordHash).not.toContain(PASSWORD);
    expect(credential.passwordHash.startsWith('scrypt$1$')).toBe(true);

    const rawToken = decodeURIComponent(registered.cookie.split('=')[1]);
    const storedSession = await prisma.authSession.findFirstOrThrow({
      where: { userId: registered.userId },
    });
    expect(storedSession.tokenHash).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(storedSession.tokenHash).not.toBe(rawToken);
    expect(JSON.stringify(registered.body)).not.toMatch(/password|token|credential/i);

    const duplicate = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: `${emailPrefix}-NORMALIZED@example.com`,
        password: PASSWORD,
      }),
    });
    expect(duplicate.status).toBe(409);
    expect(await json(duplicate)).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('logs in without revealing whether the email or password was wrong', async () => {
    const email = `${emailPrefix}-login@example.com`;
    await register('login', email);
    const success = await login(` ${email.toUpperCase()} `);
    expect(success.status).toBe(200);
    expect(success.headers.get('set-cookie')).toContain('HttpOnly');

    const wrongPassword = await login(email, 'wrong-password-value');
    const missingEmail = await login(`${emailPrefix}-missing@example.com`, 'wrong-password-value');
    expect(wrongPassword.status).toBe(401);
    expect(missingEmail.status).toBe(401);
    expect((await json(wrongPassword)).error?.message).toBe((await json(missingEmail)).error?.message);
  });

  it('authenticates /me and enforces expiry, revocation, deletion, and active status', async () => {
    const email = `${emailPrefix}-state@example.com`;
    const registered = await register('state', email);
    expect((await request('/me', { cookie: registered.cookie })).status).toBe(200);
    expect((await request('/me')).status).toBe(401);

    let session = await prisma.authSession.findFirstOrThrow({
      where: { userId: registered.userId },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.authSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await request('/me', { cookie: registered.cookie })).status).toBe(401);

    const revokedLogin = await login(email);
    const revokedCookie = cookieFrom(revokedLogin);
    session = await prisma.authSession.findFirstOrThrow({
      where: { userId: registered.userId },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    expect((await request('/me', { cookie: revokedCookie })).status).toBe(401);

    const deletedLogin = await login(email);
    const deletedCookie = cookieFrom(deletedLogin);
    session = await prisma.authSession.findFirstOrThrow({
      where: { userId: registered.userId },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.authSession.delete({ where: { id: session.id } });
    expect((await request('/me', { cookie: deletedCookie })).status).toBe(401);

    const inactiveLogin = await login(email);
    const inactiveCookie = cookieFrom(inactiveLogin);
    await prisma.user.update({ where: { id: registered.userId }, data: { status: 'inactive' } });
    expect((await request('/me', { cookie: inactiveCookie })).status).toBe(401);
    const inactiveRelogin = await login(email);
    expect(inactiveRelogin.status).toBe(401);
    expect((await json(inactiveRelogin)).error?.message).toBe('Invalid email or password.');
  });

  it('revokes logout sessions idempotently and supports a real development session', async () => {
    const registered = await register('logout');
    const logout = await request('/auth/logout', { method: 'POST', cookie: registered.cookie });
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await request('/me', { cookie: registered.cookie })).status).toBe(401);
    expect((await request('/auth/logout', { method: 'POST', cookie: registered.cookie })).status).toBe(200);

    const developmentSession = await request('/dev/session', { method: 'POST' });
    expect(developmentSession.status).toBe(201);
    expect((await request('/me', { cookie: cookieFrom(developmentSession) })).status).toBe(200);
  });

  it('sets Secure on production cookies', () => {
    const service = new SessionCookieService({
      get: () => 'production',
    } as unknown as ConfigService);
    let header = '';
    service.set({ setHeader: (_name, value) => { header = value; } }, 'raw-token', new Date('2030-01-01'));
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Secure');
  });

  it('derives ownership from the session and hides User A resources from User B', async () => {
    const userA = await register('owner-a');
    const userB = await register('owner-b');
    await prisma.tasteProfile.createMany({
      data: [userA.userId, userB.userId].map((userId) => ({ userId, algorithmVersion: 'taste-v1' })),
    });

    const injectedOwner = await request('/cook-sessions', {
      method: 'POST',
      cookie: userA.cookie,
      body: JSON.stringify({ userId: userB.userId, recipeSlug: slug }),
    });
    expect(injectedOwner.status).toBe(400);
    expect(await json(injectedOwner)).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const start = await request('/cook-sessions', {
      method: 'POST',
      cookie: userA.cookie,
      body: JSON.stringify({ recipeSlug: slug }),
    });
    expect(start.status).toBe(201);
    const sessionId = (await json(start)).data?.id as string;

    expect((await request(`/cook-sessions/${sessionId}`, { cookie: userB.cookie })).status).toBe(404);
    expect((await request(`/cook-sessions/${sessionId}/events`, {
      method: 'POST',
      cookie: userB.cookie,
      body: JSON.stringify({
        eventType: 'step_completed',
        clientSeq: 1,
        clientTime: new Date().toISOString(),
        payload: { stepNo: 1 },
      }),
    })).status).toBe(404);
    expect((await request(`/cook-sessions/${sessionId}/complete`, {
      method: 'POST',
      cookie: userB.cookie,
    })).status).toBe(404);
    expect((await request(`/cook-sessions/${sessionId}/feedback`, {
      method: 'POST',
      cookie: userB.cookie,
      body: JSON.stringify({ dimensions: { saltiness: 0 } }),
    })).status).toBe(404);

    expect((await request(`/cook-sessions/${sessionId}/events`, {
      method: 'POST',
      cookie: userA.cookie,
      body: JSON.stringify({
        eventType: 'step_completed',
        clientSeq: 1,
        clientTime: new Date().toISOString(),
        payload: { stepNo: 1 },
      }),
    })).status).toBe(201);
    expect((await request(`/cook-sessions/${sessionId}/complete`, {
      method: 'POST',
      cookie: userA.cookie,
    })).status).toBe(200);
    expect((await request(`/cook-sessions/${sessionId}/feedback`, {
      method: 'POST',
      cookie: userA.cookie,
      body: JSON.stringify({ dimensions: { saltiness: 0 } }),
    })).status).toBe(201);
    expect((await request(`/cook-sessions/${sessionId}`, { cookie: userA.cookie })).status).toBe(200);

    const personalized = await request(`/me/recipes/${slug}/personalized-versions`, {
      method: 'POST',
      cookie: userA.cookie,
    });
    expect(personalized.status).toBe(201);
    const personalizedId = (await json(personalized)).data?.id as string;
    expect((await request(`/me/recipes/${slug}/personalized-versions/latest`, {
      cookie: userB.cookie,
    })).status).toBe(404);
    expect((await request('/cook-sessions', {
      method: 'POST',
      cookie: userB.cookie,
      body: JSON.stringify({ recipeSlug: slug, personalizedRecipeVersionId: personalizedId }),
    })).status).toBe(404);

    const userBTaste = await request('/me/taste-profile', { cookie: userB.cookie });
    expect(userBTaste.status).toBe(200);
    expect((await json(userBTaste)).data).toMatchObject({ userId: userB.userId });
    expect((await request('/me/taste-profile', { cookie: userA.cookie })).status).toBe(200);
    expect((await request(`/users/${userA.userId}/taste-profile`, { cookie: userB.cookie })).status).toBe(404);
    expect((await request(`/users/${userA.userId}/recipes/${slug}/personalized-versions/latest`, {
      cookie: userB.cookie,
    })).status).toBe(404);
  });

  it('rejects foreign or missing mutation origins and emits credential-safe CORS headers', async () => {
    const registered = await register('csrf');
    const allowed = await request('/cook-sessions', {
      method: 'POST',
      cookie: registered.cookie,
      body: JSON.stringify({ recipeSlug: slug }),
    });
    expect(allowed.status).toBe(201);
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
    expect(allowed.headers.get('access-control-allow-origin')).not.toBe('*');

    const foreign = await request('/cook-sessions', {
      method: 'POST',
      cookie: registered.cookie,
      origin: 'https://foreign.example',
      body: JSON.stringify({ recipeSlug: slug }),
    });
    expect(foreign.status).toBe(403);
    expect(await json(foreign)).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(foreign.headers.get('access-control-allow-origin')).toBeNull();

    const missing = await request('/cook-sessions', {
      method: 'POST',
      cookie: registered.cookie,
      origin: null,
      body: JSON.stringify({ recipeSlug: slug }),
    });
    // NODE_ENV=test intentionally permits non-browser mutation clients without
    // Origin; development and production reject this case.
    expect(missing.status).toBe(201);
  });
});
