import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';
import { configureHttp } from './http/configure-http';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Phase14a-pantry-password!';

type Account = { id: string; cookie: string };

describe('Phase 14A household pantry (HTTP integration)', () => {
  const runId = randomUUID().replace(/-/g, '');
  const prefix = `phase14a-${runId}`;
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const userIds: string[] = [];
  const householdIds: string[] = [];
  const ingredientIds: string[] = [];
  let owner: Account;
  let member: Account;
  let outsider: Account;
  let foreignOwner: Account;
  let deletingMember: Account;
  let removedMember: Account;
  let cascadeOwner: Account;
  let householdId: string;
  let foreignHouseholdId: string;
  let alphaIngredientId: string;
  let betaIngredientId: string;
  let raceIngredientId: string;
  let provenanceIngredientId: string;
  let alphaItemId: string;
  let betaItemId: string;
  let alphaRevision = 1;

  async function request(path: string, init: RequestInit & { cookie?: string } = {}) {
    const { cookie, ...rest } = init;
    const headers = new Headers(rest.headers);
    headers.set('origin', ORIGIN);
    if (cookie) headers.set('cookie', cookie);
    if (rest.body) headers.set('content-type', 'application/json');
    return fetch(`${base}${path}`, { ...rest, headers });
  }

  async function json<T>(response: Response): Promise<T> {
    return await response.json() as T;
  }

  async function register(label: string): Promise<Account> {
    const response = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: `${prefix}-${label}@example.com`, password: PASSWORD }),
    });
    expect(response.status).toBe(201);
    const result = await json<{ data: { user: { id: string } } }>(response);
    const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) throw new Error('Expected session cookie.');
    userIds.push(result.data.user.id);
    return { id: result.data.user.id, cookie };
  }

  async function createHousehold(account: Account, name: string) {
    const response = await request('/me/household', {
      method: 'POST', cookie: account.cookie, body: JSON.stringify({ name }),
    });
    expect(response.status).toBe(201);
    const result = await json<{ data: { id: string } }>(response);
    householdIds.push(result.data.id);
    return result.data.id;
  }

  async function invite(account: Account, invitee: Account) {
    const created = await request('/me/household/invites', { method: 'POST', cookie: account.cookie });
    expect(created.status).toBe(201);
    const inviteBody = await json<{ data: { token: string } }>(created);
    expect((await request('/household-invites/accept', {
      method: 'POST', cookie: invitee.cookie, body: JSON.stringify({ token: inviteBody.data.token }),
    })).status).toBe(201);
  }

  function createBody(ingredientId: string, overrides: Record<string, unknown> = {}) {
    return {
      ingredientId,
      quantity: 500,
      unit: ' g ',
      bestBeforeDate: '2026-10-20',
      note: ' Ngăn mát ',
      ...overrides,
    };
  }

  function updateBody(expectedRevision: number, overrides: Record<string, unknown> = {}) {
    return {
      expectedRevision,
      quantity: 350.125,
      unit: 'g',
      bestBeforeDate: '2020-01-02',
      note: 'Đã mở gói',
      ...overrides,
    };
  }

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_KEY_PREFIX = `${prefix}:auth`;
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttp(app, app.get(ConfigService));
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address() as { port: number };
    base = `http://127.0.0.1:${address.port}/v1`;

    [owner, member, outsider, foreignOwner, deletingMember, removedMember, cascadeOwner] = await Promise.all([
      register('owner'), register('member'), register('outsider'), register('foreign'),
      register('deleting-member'), register('removed-member'), register('cascade-owner'),
    ]);
    householdId = await createHousehold(owner, 'Nhà có kho');
    foreignHouseholdId = await createHousehold(foreignOwner, 'Nhà kho khác');
    await invite(owner, member);
    await invite(owner, deletingMember);
    await invite(owner, removedMember);

    const ingredients = await Promise.all([
      prisma.ingredient.create({ data: { slug: `${prefix}-alpha`, canonicalName: 'Alpha pantry', category: 'produce' } }),
      prisma.ingredient.create({ data: { slug: `${prefix}-beta`, canonicalName: 'Beta pantry', category: 'seasoning' } }),
      prisma.ingredient.create({ data: { slug: `${prefix}-race`, canonicalName: 'Race pantry', category: null } }),
      prisma.ingredient.create({ data: { slug: `${prefix}-provenance`, canonicalName: 'Provenance pantry', category: 'dry' } }),
    ]);
    ingredientIds.push(...ingredients.map((ingredient) => ingredient.id));
    [alphaIngredientId, betaIngredientId, raceIngredientId, provenanceIngredientId] = ingredients.map((ingredient) => ingredient.id);
  });

  afterAll(async () => {
    await prisma.householdPantryItem.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdMealPlanEntry.deleteMany({ where: { mealPlan: { householdId: { in: householdIds } } } });
    await prisma.householdMealPlan.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdPersonalizedRecipeVersion.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdInvite.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdMember.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
    await prisma.ingredient.deleteMany({ where: { id: { in: ingredientIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('creates, shares, orders, and owner-scopes canonical pantry items', async () => {
    expect((await request('/me/household/pantry', { cookie: member.cookie })).status).toBe(200);
    expect((await request('/me/household/pantry', { cookie: outsider.cookie })).status).toBe(404);

    const beta = await request('/me/household/pantry', {
      method: 'POST', cookie: member.cookie, body: JSON.stringify(createBody(betaIngredientId)),
    });
    expect(beta.status).toBe(201);
    betaItemId = (await json<{ data: { id: string } }>(beta)).data.id;
    const alpha = await request('/me/household/pantry', {
      method: 'POST', cookie: owner.cookie,
      body: JSON.stringify(createBody(alphaIngredientId, { quantity: 1.25, bestBeforeDate: null })),
    });
    expect(alpha.status).toBe(201);
    const alphaBody = await json<{ data: { id: string; revision: number; unit: string; note: string; ingredient: { id: string } } }>(alpha);
    alphaItemId = alphaBody.data.id;
    expect(alphaBody.data).toMatchObject({ revision: 1, unit: 'g', note: 'Ngăn mát', ingredient: { id: alphaIngredientId } });

    const list = await json<{ data: Array<{ id: string; ingredient: { name: string } }> }>(
      await request('/me/household/pantry', { cookie: member.cookie }),
    );
    expect(list.data.map((item) => item.ingredient.name)).toEqual(['Alpha pantry', 'Beta pantry']);

    expect((await request('/me/household/pantry', {
      method: 'POST', cookie: owner.cookie, body: JSON.stringify(createBody(alphaIngredientId)),
    })).status).toBe(409);
    expect((await request('/me/household/pantry', {
      method: 'POST', cookie: foreignOwner.cookie, body: JSON.stringify(createBody(alphaIngredientId)),
    })).status).toBe(201);
    expect(await prisma.householdPantryItem.count({ where: { ingredientId: alphaIngredientId } })).toBe(2);

    expect((await request(`/me/household/pantry/${alphaItemId}`, {
      method: 'PUT', cookie: foreignOwner.cookie, body: JSON.stringify(updateBody(1)),
    })).status).toBe(404);
    expect((await request(`/me/household/pantry/${alphaItemId}?expectedRevision=1`, {
      method: 'DELETE', cookie: foreignOwner.cookie,
    })).status).toBe(404);
  });

  it('validates quantity, unit, dates, notes, and canonical ingredient identity', async () => {
    const unknown = randomUUID();
    expect((await request('/me/household/pantry', {
      method: 'POST', cookie: owner.cookie, body: JSON.stringify(createBody(unknown)),
    })).status).toBe(404);

    for (const quantity of [0, -1, 1.2345, 1_000_000_000]) {
      expect((await request('/me/household/pantry', {
        method: 'POST', cookie: owner.cookie,
        body: JSON.stringify(createBody(raceIngredientId, { quantity })),
      })).status).toBe(400);
    }
    for (const unit of ['   ', 'x'.repeat(33)]) {
      expect((await request('/me/household/pantry', {
        method: 'POST', cookie: owner.cookie,
        body: JSON.stringify(createBody(raceIngredientId, { unit })),
      })).status).toBe(400);
    }
    for (const bestBeforeDate of ['2026/10/20', '2026-02-30']) {
      expect((await request('/me/household/pantry', {
        method: 'POST', cookie: owner.cookie,
        body: JSON.stringify(createBody(raceIngredientId, { bestBeforeDate })),
      })).status).toBe(400);
    }
    expect((await request('/me/household/pantry', {
      method: 'POST', cookie: owner.cookie,
      body: JSON.stringify(createBody(raceIngredientId, { note: 'x'.repeat(501) })),
    })).status).toBe(400);
  });

  it('increments revisions and rejects stale or concurrent lost updates', async () => {
    const updated = await request(`/me/household/pantry/${alphaItemId}`, {
      method: 'PUT', cookie: member.cookie, body: JSON.stringify(updateBody(alphaRevision)),
    });
    expect(updated.status).toBe(200);
    const updatedBody = await json<{ data: { revision: number; quantity: number; bestBeforeDate: string } }>(updated);
    alphaRevision = updatedBody.data.revision;
    expect(updatedBody.data).toMatchObject({ revision: 2, quantity: 350.125, bestBeforeDate: '2020-01-02' });

    expect((await request(`/me/household/pantry/${alphaItemId}`, {
      method: 'PUT', cookie: owner.cookie, body: JSON.stringify(updateBody(1)),
    })).status).toBe(409);

    const raced = await Promise.all([
      request(`/me/household/pantry/${alphaItemId}`, {
        method: 'PUT', cookie: owner.cookie,
        body: JSON.stringify(updateBody(alphaRevision, { quantity: 200 })),
      }),
      request(`/me/household/pantry/${alphaItemId}`, {
        method: 'PUT', cookie: member.cookie,
        body: JSON.stringify(updateBody(alphaRevision, { quantity: 225 })),
      }),
    ]);
    expect(raced.map((response) => response.status).sort()).toEqual([200, 409]);
    alphaRevision += 1;
    expect((await prisma.householdPantryItem.findUniqueOrThrow({ where: { id: alphaItemId } })).revision).toBe(alphaRevision);
  });

  it('serializes concurrent creates and does not mutate Taste, planning, or cooking state', async () => {
    const before = {
      taste: await prisma.tasteProfile.count(),
      plans: await prisma.householdMealPlan.count(),
      sessions: await prisma.cookSession.count(),
    };
    const raced = await Promise.all([
      request('/me/household/pantry', {
        method: 'POST', cookie: owner.cookie, body: JSON.stringify(createBody(raceIngredientId, { quantity: 1, unit: 'piece' })),
      }),
      request('/me/household/pantry', {
        method: 'POST', cookie: member.cookie, body: JSON.stringify(createBody(raceIngredientId, { quantity: 2, unit: 'piece' })),
      }),
    ]);
    expect(raced.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.householdPantryItem.count({ where: { householdId, ingredientId: raceIngredientId } })).toBe(1);
    expect({
      taste: await prisma.tasteProfile.count(),
      plans: await prisma.householdMealPlan.count(),
      sessions: await prisma.cookSession.count(),
    }).toEqual(before);
  });

  it('enforces current membership and active household status', async () => {
    await prisma.householdMember.delete({ where: { userId: removedMember.id } });
    expect((await request('/me/household/pantry', { cookie: removedMember.cookie })).status).toBe(404);
    expect((await request(`/me/household/pantry/${betaItemId}`, {
      method: 'PUT', cookie: removedMember.cookie, body: JSON.stringify(updateBody(1)),
    })).status).toBe(404);

    await prisma.household.update({ where: { id: householdId }, data: { status: 'closed' } });
    expect((await request('/me/household/pantry', { cookie: owner.cookie })).status).toBe(200);
    expect((await request(`/me/household/pantry/${betaItemId}`, {
      method: 'PUT', cookie: owner.cookie, body: JSON.stringify(updateBody(1)),
    })).status).toBe(404);
    expect((await request(`/me/household/pantry/${betaItemId}?expectedRevision=1`, {
      method: 'DELETE', cookie: owner.cookie,
    })).status).toBe(404);
    await prisma.household.update({ where: { id: householdId }, data: { status: 'active' } });
  });

  it('preserves shared inventory and nulls provenance when its member is deleted', async () => {
    const created = await request('/me/household/pantry', {
      method: 'POST', cookie: deletingMember.cookie,
      body: JSON.stringify(createBody(provenanceIngredientId, { quantity: 3, unit: 'piece' })),
    });
    expect(created.status).toBe(201);
    const itemId = (await json<{ data: { id: string } }>(created)).data.id;
    expect((await request(`/me/household/pantry/${itemId}`, {
      method: 'PUT', cookie: deletingMember.cookie, body: JSON.stringify(updateBody(1, { quantity: 2, unit: 'piece' })),
    })).status).toBe(200);

    expect((await request('/me/account', {
      method: 'DELETE', cookie: deletingMember.cookie,
      body: JSON.stringify({ password: PASSWORD, confirm: 'DELETE' }),
    })).status).toBe(200);
    const preserved = await prisma.householdPantryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(preserved).toMatchObject({ householdId, createdByUserId: null, updatedByUserId: null });
    expect((await request('/me/household/pantry', { cookie: owner.cookie })).status).toBe(200);
  });

  it('requires a current revision for delete and never deletes canonical ingredients', async () => {
    expect((await request(`/me/household/pantry/${alphaItemId}?expectedRevision=1`, {
      method: 'DELETE', cookie: owner.cookie,
    })).status).toBe(409);
    expect((await request(`/me/household/pantry/${alphaItemId}?expectedRevision=${alphaRevision}`, {
      method: 'DELETE', cookie: owner.cookie,
    })).status).toBe(200);
    expect(await prisma.ingredient.findUnique({ where: { id: alphaIngredientId } })).not.toBeNull();
  });

  it('cascades pantry rows only when their household is deleted', async () => {
    const cascadeHouseholdId = await createHousehold(cascadeOwner, 'Nhà kiểm thử cascade');
    const created = await request('/me/household/pantry', {
      method: 'POST', cookie: cascadeOwner.cookie,
      body: JSON.stringify(createBody(betaIngredientId, { quantity: 7, unit: 'piece' })),
    });
    expect(created.status).toBe(201);
    const itemId = (await json<{ data: { id: string } }>(created)).data.id;
    await prisma.household.delete({ where: { id: cascadeHouseholdId } });
    expect(await prisma.householdPantryItem.findUnique({ where: { id: itemId } })).toBeNull();
    expect(await prisma.ingredient.findUnique({ where: { id: betaIngredientId } })).not.toBeNull();
  });
});
