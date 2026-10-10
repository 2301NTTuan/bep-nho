import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PrismaService } from './database/prisma.service';
import { configureHttp } from './http/configure-http';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Phase14b-discovery-password!';
type Account = { id: string; cookie: string };

describe('Phase 14B pantry ingredient discovery (HTTP integration)', () => {
  const runId = randomUUID().replace(/-/g, '');
  const prefix = `phase14b-${runId}`;
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const userIds: string[] = [];
  const householdIds: string[] = [];
  const ingredientIds: string[] = [];
  let owner: Account;
  let member: Account;
  let noHousehold: Account;
  let removedMember: Account;
  let closedOwner: Account;
  let householdId: string;

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
    const payload = await json<{ data: { user: { id: string } } }>(response);
    const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) throw new Error('Expected session cookie.');
    userIds.push(payload.data.user.id);
    return { id: payload.data.user.id, cookie };
  }

  async function createHousehold(account: Account, name: string) {
    const response = await request('/me/household', {
      method: 'POST', cookie: account.cookie, body: JSON.stringify({ name }),
    });
    expect(response.status).toBe(201);
    const payload = await json<{ data: { id: string } }>(response);
    householdIds.push(payload.data.id);
    return payload.data.id;
  }

  async function invite(account: Account, invitee: Account) {
    const invite = await request('/me/household/invites', { method: 'POST', cookie: account.cookie });
    expect(invite.status).toBe(201);
    const payload = await json<{ data: { token: string } }>(invite);
    expect((await request('/household-invites/accept', {
      method: 'POST', cookie: invitee.cookie, body: JSON.stringify({ token: payload.data.token }),
    })).status).toBe(201);
  }

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_KEY_PREFIX = `${prefix}:auth`;
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttp(app, app.get(ConfigService));
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address() as { port: number };
    base = `http://127.0.0.1:${address.port}/v1`;

    [owner, member, noHousehold, removedMember, closedOwner] = await Promise.all([
      register('owner'), register('member'), register('none'), register('removed'), register('closed'),
    ]);
    householdId = await createHousehold(owner, 'Nhà discovery');
    const closedHouseholdId = await createHousehold(closedOwner, 'Nhà đã đóng');
    await invite(owner, member);
    await invite(owner, removedMember);
    await prisma.household.update({ where: { id: closedHouseholdId }, data: { status: 'closed' } });

    const ingredients = await Promise.all([
      prisma.ingredient.create({ data: { slug: `${prefix}-rau-a`, canonicalName: `Rau cải ${runId} A`, category: 'produce' } }),
      prisma.ingredient.create({ data: { slug: `${prefix}-rau-b`, canonicalName: `Rau cải ${runId} B`, category: 'produce' } }),
      prisma.ingredient.create({ data: { slug: `${prefix}-thit`, canonicalName: `Thịt heo ${runId}`, category: 'protein' } }),
      prisma.ingredient.create({ data: { slug: `${prefix}-same-a`, canonicalName: `Xếp hạng ${runId}`, category: null } }),
      prisma.ingredient.create({ data: { slug: `${prefix}-same-b`, canonicalName: `Xếp hạng ${runId}`, category: null } }),
    ]);
    ingredientIds.push(...ingredients.map((item) => item.id));
  });

  afterAll(async () => {
    await prisma.householdPantryItem.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdInvite.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.householdMember.deleteMany({ where: { householdId: { in: householdIds } } });
    await prisma.household.deleteMany({ where: { id: { in: householdIds } } });
    await prisma.ingredient.deleteMany({ where: { id: { in: ingredientIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('discovers only safe canonical ingredient fields in deterministic bounded order', async () => {
    const before = {
      pantry: await prisma.householdPantryItem.count(),
      taste: await prisma.tasteProfile.count(),
      plans: await prisma.householdMealPlan.count(),
      sessions: await prisma.cookSession.count(),
    };
    const empty = await request('/me/household/pantry/ingredients', { cookie: owner.cookie });
    expect(empty.status).toBe(200);
    const emptyData = await json<{ data: Array<{ id: string; slug: string; name: string; category: string | null }> }>(empty);
    expect(emptyData.data.length).toBeLessThanOrEqual(30);
    const expectedOrder = await prisma.ingredient.findMany({
      select: { id: true, slug: true, canonicalName: true, category: true },
      orderBy: [{ canonicalName: 'asc' }, { id: 'asc' }],
      take: 30,
    });
    expect(emptyData.data).toEqual(expectedOrder.map((item) => ({
      id: item.id, slug: item.slug, name: item.canonicalName, category: item.category,
    })));
    expect(Object.keys(emptyData.data[0] ?? {}).sort()).toEqual(['category', 'id', 'name', 'slug']);

    const searched = await request(`/me/household/pantry/ingredients?query=%20RAU%20C%E1%BA%A2I%20${runId}%20&limit=50`, { cookie: member.cookie });
    expect(searched.status).toBe(200);
    const searchedData = await json<{ data: Array<{ id: string; name: string }> }>(searched);
    expect(searchedData.data.map((item) => item.name)).toEqual([`Rau cải ${runId} A`, `Rau cải ${runId} B`]);

    const sameName = await json<{ data: Array<{ id: string; name: string }> }>(
      await request(`/me/household/pantry/ingredients?query=X%E1%BA%BFp%20h%E1%BA%A1ng%20${runId}&limit=1`, { cookie: owner.cookie }),
    );
    expect(sameName.data).toHaveLength(1);
    expect(sameName.data[0].name).toBe(`Xếp hạng ${runId}`);
    expect({
      pantry: await prisma.householdPantryItem.count(),
      taste: await prisma.tasteProfile.count(),
      plans: await prisma.householdMealPlan.count(),
      sessions: await prisma.cookSession.count(),
    }).toEqual(before);
  });

  it('requires current active household membership and validates bounded discovery input', async () => {
    expect((await request('/me/household/pantry/ingredients', { cookie: noHousehold.cookie })).status).toBe(404);
    expect((await request('/me/household/pantry/ingredients', { cookie: closedOwner.cookie })).status).toBe(404);

    await prisma.householdMember.delete({ where: { userId: removedMember.id } });
    expect((await request('/me/household/pantry/ingredients', { cookie: removedMember.cookie })).status).toBe(404);

    expect((await request('/me/household/pantry/ingredients?limit=51', { cookie: owner.cookie })).status).toBe(400);
    expect((await request(`/me/household/pantry/ingredients?query=${'x'.repeat(121)}`, { cookie: owner.cookie })).status).toBe(400);
    expect((await request('/me/household/pantry/ingredients?query=%20%20%20', { cookie: owner.cookie })).status).toBe(200);
    expect(await prisma.householdMember.count({ where: { householdId } })).toBe(2);
  });
});
