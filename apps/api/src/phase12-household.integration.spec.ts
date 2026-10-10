import { randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureHttp } from './http/configure-http';
import { PrismaService } from './database/prisma.service';

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'Phase12-household-password!';

describe('Phase 12 household and Family Taste (HTTP integration)', () => {
  const runId = randomUUID().replace(/-/g, '');
  const prefix = `phase12-${runId}`;
  let app: INestApplication;
  let prisma: PrismaService;
  let base: string;
  const userIds: string[] = [];
  let householdId: string | null = null;
  let recipeId: string | null = null;
  let ingredientId: string | null = null;

  async function request(path: string, init: RequestInit & { cookie?: string } = {}) {
    const { cookie, ...rest } = init;
    const headers = new Headers(rest.headers);
    headers.set('origin', ORIGIN);
    if (cookie) headers.set('cookie', cookie);
    if (rest.body) headers.set('content-type', 'application/json');
    return fetch(`${base}${path}`, { ...rest, headers });
  }

  async function body<T>(response: Response): Promise<T> { return await response.json() as T; }

  async function register(label: string) {
    const response = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: `${prefix}-${label}@example.com`, password: PASSWORD }),
    });
    expect(response.status).toBe(201);
    const result = await body<{ data: { user: { id: string } } }>(response);
    const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
    if (!cookie) throw new Error('Expected session cookie');
    userIds.push(result.data.user.id);
    return { id: result.data.user.id, cookie };
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    configureHttp(app, app.get(ConfigService));
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address() as { port: number };
    base = `http://127.0.0.1:${address.port}/v1`;
  });

  afterAll(async () => {
    if (householdId) {
      await prisma.cookSession.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.householdPersonalizedRecipeVersion.deleteMany({ where: { householdId } });
      await prisma.householdInvite.deleteMany({ where: { householdId } });
      await prisma.householdMember.deleteMany({ where: { householdId } });
      await prisma.household.deleteMany({ where: { id: householdId } });
    }
    if (recipeId) await prisma.recipe.deleteMany({ where: { id: recipeId } });
    if (ingredientId) await prisma.ingredient.deleteMany({ where: { id: ingredientId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('enforces membership, secure invites, deterministic Family Taste, immutable versions, and historical sessions', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'log');
    const owner = await register('owner');
    const member = await register('member');
    const contenderA = await register('contender-a');
    const contenderB = await register('contender-b');

    for (const [userId, score] of [[owner.id, 0.8], [member.id, -0.2]] as const) {
      await prisma.tasteProfile.create({
        data: {
          userId,
          algorithmVersion: 'taste-v1',
          dimensions: { create: { dimensionKey: 'saltiness', score, confidence: 0.5 } },
        },
      });
    }

    const created = await request('/me/household', { method: 'POST', cookie: owner.cookie, body: JSON.stringify({ name: 'Nhà kiểm thử' }) });
    expect(created.status).toBe(201);
    const createdBody = await body<{ data: { id: string } }>(created);
    householdId = createdBody.data.id;

    expect((await request('/me/household')).status).toBe(401);
    expect((await request('/me/household', { method: 'POST', cookie: owner.cookie, body: JSON.stringify({ name: 'Nhà khác' }) })).status).toBe(409);
    expect((await request('/me/household', { method: 'PATCH', cookie: member.cookie, body: JSON.stringify({ name: 'Không được đổi' }) })).status).toBe(404);
    expect((await request('/me/household', { method: 'PATCH', cookie: owner.cookie, body: JSON.stringify({ name: 'Nhà kiểm thử đã đổi tên' }) })).status).toBe(200);

    const expiredInvite = await body<{ data: { token: string } }>(await request('/me/household/invites', { method: 'POST', cookie: owner.cookie }));
    const expiredStoredInvite = await prisma.householdInvite.findFirstOrThrow({
      where: { householdId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    await prisma.householdInvite.update({ where: { id: expiredStoredInvite.id }, data: { expiresAt: new Date(0) } });
    expect((await request('/household-invites/accept', { method: 'POST', cookie: member.cookie, body: JSON.stringify({ token: expiredInvite.data.token }) })).status).toBe(400);

    const invite = await request('/me/household/invites', { method: 'POST', cookie: owner.cookie });
    expect(invite.status).toBe(201);
    const inviteBody = await body<{ data: { token: string } }>(invite);
    expect(await prisma.householdInvite.findFirst({ where: { householdId, tokenHash: inviteBody.data.token } })).toBeNull();
    const storedInvite = await prisma.householdInvite.findFirstOrThrow({ where: { householdId } });
    expect(storedInvite.tokenHash).not.toContain(inviteBody.data.token);
    expect(logSpy.mock.calls.flat().join(' ')).not.toContain(inviteBody.data.token);

    expect((await request('/household-invites/accept', { method: 'POST', cookie: member.cookie, body: JSON.stringify({ token: inviteBody.data.token }) })).status).toBe(201);
    expect((await request('/household-invites/accept', { method: 'POST', cookie: contenderA.cookie, body: JSON.stringify({ token: inviteBody.data.token }) })).status).toBe(400);
    expect((await request('/me/household/invites', { method: 'POST', cookie: member.cookie })).status).toBe(403);
    const alreadyMemberInvite = await body<{ data: { token: string } }>(await request('/me/household/invites', { method: 'POST', cookie: owner.cookie }));
    expect((await request('/household-invites/accept', { method: 'POST', cookie: member.cookie, body: JSON.stringify({ token: alreadyMemberInvite.data.token }) })).status).toBe(409);

    const ownerRow = await prisma.householdMember.findUniqueOrThrow({ where: { userId: owner.id } });
    expect((await request(`/me/household/members/${ownerRow.id}`, { method: 'DELETE', cookie: member.cookie })).status).toBe(403);

    const family = await request('/me/household/taste-profile', { cookie: member.cookie });
    expect(family.status).toBe(200);
    const familyBody = await body<{ data: { dimensions: Array<{ key: string; score: number; confidence: number; activeMemberCount: number }> } }>(family);
    expect(familyBody.data.dimensions.find((item) => item.key === 'saltiness')).toEqual(expect.objectContaining({ score: 0.3, confidence: 0.5, activeMemberCount: 2 }));

    const raceInvite = await body<{ data: { token: string } }>(await request('/me/household/invites', { method: 'POST', cookie: owner.cookie }));
    const raced = await Promise.all([
      request('/household-invites/accept', { method: 'POST', cookie: contenderA.cookie, body: JSON.stringify({ token: raceInvite.data.token }) }),
      request('/household-invites/accept', { method: 'POST', cookie: contenderB.cookie, body: JSON.stringify({ token: raceInvite.data.token }) }),
    ]);
    expect(raced.filter((response) => response.status === 201)).toHaveLength(1);
    expect(raced.filter((response) => response.status === 400)).toHaveLength(1);

    ingredientId = (await prisma.ingredient.create({ data: { slug: `${prefix}-salt`, canonicalName: 'Muối Phase 12' } })).id;
    const recipe = await prisma.recipe.create({
      data: {
        slug: `${prefix}-recipe`, canonicalTitle: 'Món gia đình Phase 12', status: 'published',
        versions: {
          create: {
            versionNo: 1, servings: 2, summary: 'Family Taste test', contentHash: randomUUID().replace(/-/g, ''), publishedAt: new Date(),
            ingredients: { create: { ingredientId, quantity: 10, unit: 'g', sortOrder: 1 } },
            steps: { create: { stepNo: 1, instruction: 'Nấu.' } },
            adjustmentRules: { create: { ingredientId, dimensionKey: 'saltiness', sensitivity: 0.5, minFactor: 0.75, maxFactor: 1.25 } },
          },
        },
      },
    });
    recipeId = recipe.id;
    const generated = await Promise.all([
      request(`/me/household/recipes/${recipe.slug}/personalized-versions`, { method: 'POST', cookie: owner.cookie }),
      request(`/me/household/recipes/${recipe.slug}/personalized-versions`, { method: 'POST', cookie: member.cookie }),
    ]);
    const generatedStatuses = generated.map((response) => response.status);
    if (generatedStatuses.some((status) => status !== 201)) {
      throw new Error(`Family generation failed: ${await Promise.all(generated.map((response) => response.clone().text()))}`);
    }
    expect(generatedStatuses).toEqual([201, 201]);
    expect(await prisma.householdPersonalizedRecipeVersion.count({ where: { householdId, recipeId } })).toBe(1);
    const versionBody = await body<{ data: { id: string; algorithmVersion: string } }>(generated[0]);
    expect(versionBody.data.algorithmVersion).toBe('family-personalize-v1');

    const cooking = await request('/cook-sessions', {
      method: 'POST', cookie: member.cookie,
      body: JSON.stringify({ recipeSlug: recipe.slug, householdPersonalizedRecipeVersionId: versionBody.data.id }),
    });
    expect(cooking.status).toBe(201);
    const cookingBody = await body<{ data: { id: string; recipe: { source: string; householdPersonalizedVersionId: string } } }>(cooking);
    expect(cookingBody.data.recipe).toEqual(expect.objectContaining({ source: 'household', householdPersonalizedVersionId: versionBody.data.id }));

    const ownerBefore = await prisma.tasteDimension.findFirstOrThrow({ where: { tasteProfile: { userId: owner.id }, dimensionKey: 'saltiness' } });
    expect((await request(`/cook-sessions/${cookingBody.data.id}/complete`, { method: 'POST', cookie: member.cookie })).status).toBe(200);
    expect((await request(`/cook-sessions/${cookingBody.data.id}/feedback`, {
      method: 'POST', cookie: member.cookie,
      body: JSON.stringify({ dimensions: { saltiness: 1 }, privateNote: 'Chỉ người nấu được sở hữu ghi chú này.' }),
    })).status).toBe(201);
    const ownerAfter = await prisma.tasteDimension.findFirstOrThrow({ where: { tasteProfile: { userId: owner.id }, dimensionKey: 'saltiness' } });
    const memberAfter = await prisma.tasteDimension.findFirstOrThrow({ where: { tasteProfile: { userId: member.id }, dimensionKey: 'saltiness' } });
    expect(ownerAfter.score.toString()).toBe(ownerBefore.score.toString());
    expect(Number(memberAfter.score)).not.toBe(-0.2);

    const changedVersion = await request(`/me/household/recipes/${recipe.slug}/personalized-versions`, { method: 'POST', cookie: member.cookie });
    expect(changedVersion.status).toBe(201);
    const changedVersionBody = await body<{ data: { id: string; versionNo: number; reused: boolean } }>(changedVersion);
    expect(changedVersionBody.data).toEqual(expect.objectContaining({ versionNo: 2, reused: false }));
    expect(changedVersionBody.data.id).not.toBe(versionBody.data.id);
    expect(await prisma.householdPersonalizedRecipeVersion.count({ where: { householdId, recipeId } })).toBe(2);

    expect((await request(`/me/household/members/${ownerRow.id}`, { method: 'DELETE', cookie: owner.cookie })).status).toBe(400);

    const memberRow = await prisma.householdMember.findUniqueOrThrow({ where: { userId: member.id } });
    expect((await request(`/me/household/members/${memberRow.id}`, { method: 'DELETE', cookie: owner.cookie })).status).toBe(200);
    expect((await request('/cook-sessions', { method: 'POST', cookie: member.cookie, body: JSON.stringify({ recipeSlug: recipe.slug, householdPersonalizedRecipeVersionId: versionBody.data.id }) })).status).toBe(404);
    expect((await request(`/cook-sessions/${cookingBody.data.id}`, { cookie: member.cookie })).status).toBe(200);

    await prisma.recipe.update({ where: { id: recipeId }, data: { status: 'archived' } });
    expect((await request(`/me/household/recipes/${recipe.slug}/personalized-versions`, { method: 'POST', cookie: owner.cookie })).status).toBe(409);
    expect((await request('/cook-sessions', { method: 'POST', cookie: owner.cookie, body: JSON.stringify({ recipeSlug: recipe.slug, householdPersonalizedRecipeVersionId: versionBody.data.id }) })).status).toBe(409);
    await prisma.recipe.update({ where: { id: recipeId }, data: { status: 'published' } });

    const winner = raced[0].status === 201 ? contenderA : contenderB;
    expect((await request('/me/household/leave', { method: 'POST', cookie: winner.cookie })).status).toBe(201);
    expect((await request('/me/household/taste-profile', { cookie: winner.cookie })).status).toBe(404);

    const currentCount = await prisma.householdMember.count({ where: { householdId } });
    for (let index = currentCount; index < 8; index += 1) {
      const filler = await prisma.user.create({ data: { authSubject: `${prefix}-filler-${index}` } });
      userIds.push(filler.id);
      await prisma.householdMember.create({ data: { householdId, userId: filler.id, role: 'member' } });
    }
    const loser = raced[0].status === 201 ? contenderB : contenderA;
    const fullInvite = await body<{ data: { token: string } }>(await request('/me/household/invites', { method: 'POST', cookie: owner.cookie }));
    expect((await request('/household-invites/accept', { method: 'POST', cookie: loser.cookie, body: JSON.stringify({ token: fullInvite.data.token }) })).status).toBe(409);
    logSpy.mockRestore();
  });

  it('transfers ownership deterministically during account deletion', async () => {
    const owner = await register('delete-owner');
    const oldest = await register('delete-oldest');
    const created = await body<{ data: { id: string } }>(await request('/me/household', { method: 'POST', cookie: owner.cookie, body: JSON.stringify({ name: 'Nhà chuyển chủ' }) }));
    const invite = await body<{ data: { token: string } }>(await request('/me/household/invites', { method: 'POST', cookie: owner.cookie }));
    expect((await request('/household-invites/accept', { method: 'POST', cookie: oldest.cookie, body: JSON.stringify({ token: invite.data.token }) })).status).toBe(201);
    expect((await request('/me/account', { method: 'DELETE', cookie: owner.cookie, body: JSON.stringify({ password: PASSWORD, confirm: 'DELETE' }) })).status).toBe(200);
    const promoted = await prisma.householdMember.findUniqueOrThrow({ where: { userId: oldest.id } });
    expect(promoted.role).toBe('owner');
    await prisma.householdMember.deleteMany({ where: { householdId: created.data.id } });
    await prisma.householdInvite.deleteMany({ where: { householdId: created.data.id } });
    await prisma.household.delete({ where: { id: created.data.id } });
  });

  it('removes a normal membership and closes a last-owner household during deletion', async () => {
    const owner = await register('delete-normal-owner');
    const member = await register('delete-normal-member');
    const household = await body<{ data: { id: string } }>(await request('/me/household', { method: 'POST', cookie: owner.cookie, body: JSON.stringify({ name: 'Nhà xoá thành viên' }) }));
    const invite = await body<{ data: { token: string } }>(await request('/me/household/invites', { method: 'POST', cookie: owner.cookie }));
    await request('/household-invites/accept', { method: 'POST', cookie: member.cookie, body: JSON.stringify({ token: invite.data.token }) });
    expect((await request('/me/account', { method: 'DELETE', cookie: member.cookie, body: JSON.stringify({ password: PASSWORD, confirm: 'DELETE' }) })).status).toBe(200);
    expect(await prisma.householdMember.findUnique({ where: { userId: member.id } })).toBeNull();
    expect((await prisma.household.findUniqueOrThrow({ where: { id: household.data.id } })).status).toBe('active');
    expect((await prisma.householdMember.findUniqueOrThrow({ where: { userId: owner.id } })).role).toBe('owner');
    expect((await request('/me/account', { method: 'DELETE', cookie: owner.cookie, body: JSON.stringify({ password: PASSWORD, confirm: 'DELETE' }) })).status).toBe(200);
    expect((await prisma.household.findUniqueOrThrow({ where: { id: household.data.id } })).status).toBe('closed');
    expect(await prisma.householdMember.count({ where: { householdId: household.data.id } })).toBe(0);
    await prisma.householdInvite.deleteMany({ where: { householdId: household.data.id } });
    await prisma.household.delete({ where: { id: household.data.id } });
  });
});
