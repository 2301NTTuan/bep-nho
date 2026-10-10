import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CookSnapshot, PersonalizedSnapshot, RecipeStep } from '@bep-nho/contracts';
import { scaleIngredientQuantity } from '@bep-nho/domain';
import { PrismaService } from '../database/prisma.service';
import { AddCookEventDto } from './dto/add-cook-event.dto';
import { StartCookSessionDto } from './dto/start-cook-session.dto';

const versionInclude = {
  recipe: true,
  ingredients: { orderBy: { sortOrder: 'asc' as const }, include: { ingredient: true } },
  steps: { orderBy: { stepNo: 'asc' as const } },
};

type BaseVersion = Prisma.RecipeVersionGetPayload<{ include: typeof versionInclude }>;
type SessionView = Prisma.CookSessionGetPayload<{
  include: {
    recipeVersion: { include: typeof versionInclude };
    personalizedRecipeVersion: true;
    householdPersonalizedRecipeVersion: true;
    events: true;
  };
}>;

type PersonalizationSource = NonNullable<SessionView['personalizedRecipeVersion']>
  | NonNullable<SessionView['householdPersonalizedRecipeVersion']>;

function asRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

@Injectable()
export class CookSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildSnapshot(
    base: BaseVersion,
    targetServings: number,
    personalized: PersonalizationSource | null,
    householdId: string | null = null,
    legacyFallback = false,
  ): CookSnapshot {
    const personalizedSnapshot = personalized
      ? asRecord(personalized.snapshotJson)
      : {};
    const snapshotIngredients = Array.isArray(personalizedSnapshot.ingredients)
      ? personalizedSnapshot.ingredients.map((item) => asRecord(item as Prisma.JsonValue))
      : [];
    const sourceServings = personalized
      ? numberOr(personalizedSnapshot.servings, Number(base.servings))
      : Number(base.servings);

    const ingredients = base.ingredients.map((row) => {
      const previous = snapshotIngredients.find((item) => item.slug === row.ingredient.slug);
      const canonicalQuantity = numberOr(previous?.baseQuantity, Number(row.quantity));
      const previousQuantity = numberOr(previous?.quantity, canonicalQuantity);
      const personalizationFactor = personalized
        ? numberOr(previous?.personalizationFactor, canonicalQuantity === 0 ? 1 : previousQuantity / canonicalQuantity)
        : 1;
      const scalingMode = typeof previous?.scalingMode === 'string'
        ? previous.scalingMode
        : row.scalingMode;
      const scalingExponent = numberOr(previous?.scalingExponent, Number(row.scalingExponent));
      const databaseRoundingIncrement = row.roundingIncrement === null
        ? null
        : Number(row.roundingIncrement);
      const roundingIncrement = previous?.roundingIncrement === null
        ? null
        : typeof previous?.roundingIncrement === 'number' && Number.isFinite(previous.roundingIncrement)
          ? previous.roundingIncrement
          : databaseRoundingIncrement;
      const scaled = scaleIngredientQuantity(
        {
          quantity: canonicalQuantity,
          unit: row.unit,
          scalingMode,
          scalingExponent,
          roundingIncrement,
        },
        sourceServings,
        targetServings,
        personalizationFactor,
      );

      return {
        id: row.ingredient.id,
        slug: row.ingredient.slug,
        name: typeof previous?.name === 'string' ? previous.name : row.ingredient.canonicalName,
        category: typeof previous?.category === 'string' || previous?.category === null
          ? previous.category as string | null
          : row.ingredient.category,
        quantity: scaled.quantity,
        canonicalQuantity: scaled.canonicalQuantity,
        scaledQuantity: scaled.scaledQuantity,
        personalizationFactor: scaled.personalizationFactor,
        personalized: personalized !== null && Math.abs(scaled.personalizationFactor - 1) > 0.000001,
        unit: typeof previous?.unit === 'string' ? previous.unit : row.unit,
        preparation: typeof previous?.preparation === 'string' || previous?.preparation === null
          ? previous.preparation as string | null
          : row.preparation,
        note: typeof previous?.note === 'string' || previous?.note === null
          ? previous.note as string | null
          : row.note,
        sortOrder: numberOr(previous?.sortOrder, row.sortOrder),
        scalingMode: scalingMode as 'LINEAR' | 'CONSERVATIVE' | 'FIXED',
        scalingExponent,
        roundingIncrement,
      };
    });

    const snapshotRecipe = asRecord((personalizedSnapshot.recipe ?? {}) as Prisma.JsonValue);
    const snapshotSteps = Array.isArray(personalizedSnapshot.steps)
      ? personalizedSnapshot.steps as unknown as RecipeStep[]
      : base.steps.map((step) => ({
          stepNo: step.stepNo,
          instruction: step.instruction,
          durationSeconds: step.durationSeconds,
          heatLevel: step.heatLevel,
          tip: step.tip,
        }));

    return {
      schemaVersion: 1,
      recipe: {
        id: typeof snapshotRecipe.id === 'string' ? snapshotRecipe.id : base.recipe.id,
        slug: typeof snapshotRecipe.slug === 'string' ? snapshotRecipe.slug : base.recipe.slug,
        title: typeof snapshotRecipe.title === 'string' ? snapshotRecipe.title : base.recipe.canonicalTitle,
        cuisine: typeof snapshotRecipe.cuisine === 'string' ? snapshotRecipe.cuisine : base.recipe.cuisine,
      },
      canonicalVersion: { id: base.id, versionNo: base.versionNo, servings: Number(base.servings) },
      personalizedVersion: personalized
        && householdId === null
        ? { id: personalized.id, versionNo: personalized.versionNo, algorithmVersion: personalized.algorithmVersion }
        : null,
      householdPersonalizedVersion: personalized && householdId
        ? { id: personalized.id, versionNo: personalized.versionNo, algorithmVersion: personalized.algorithmVersion, householdId }
        : null,
      servings: targetServings,
      prepTimeMinutes: numberOr(personalizedSnapshot.prepTimeMinutes, base.prepTimeMinutes ?? 0) || null,
      cookTimeMinutes: numberOr(personalizedSnapshot.cookTimeMinutes, base.cookTimeMinutes ?? 0) || null,
      summary: typeof personalizedSnapshot.summary === 'string' || personalizedSnapshot.summary === null
        ? personalizedSnapshot.summary as string | null
        : base.summary,
      ingredients,
      steps: snapshotSteps,
      adjustments: Array.isArray(personalizedSnapshot.adjustments)
        ? personalizedSnapshot.adjustments as Array<Record<string, unknown>>
        : [],
      scaling: { sourceServings, targetServings, order: 'serving_then_taste_then_round' },
      ...(legacyFallback ? { legacyFallback: true } : {}),
    };
  }

  private snapshotFor(session: SessionView): CookSnapshot {
    const stored = session.snapshotJson as unknown;
    if (stored && typeof stored === 'object' && (stored as { schemaVersion?: unknown }).schemaVersion === 1) {
      return stored as CookSnapshot;
    }
    return this.buildSnapshot(
      session.recipeVersion,
      Number(session.servings),
      session.personalizedRecipeVersion ?? session.householdPersonalizedRecipeVersion,
      session.householdPersonalizedRecipeVersion?.householdId ?? null,
      true,
    );
  }

  private serializeSession(session: SessionView) {
    const personalized = session.personalizedRecipeVersion;
    const household = session.householdPersonalizedRecipeVersion;
    return {
      data: {
        id: session.id,
        userId: session.userId,
        status: session.status,
        servings: Number(session.servings),
        syncVersion: session.syncVersion,
        startedAt: session.startedAt,
        completedAt: session.completedAt,
        recipe: {
          id: session.recipeVersion.recipe.id,
          slug: session.recipeVersion.recipe.slug,
          title: this.snapshotFor(session).recipe.title,
          source: household ? 'household' : personalized ? 'personalized' : 'canonical',
          versionId: session.recipeVersion.id,
          versionNo: session.recipeVersion.versionNo,
          personalizedVersionId: personalized?.id ?? null,
          personalizedVersionNo: personalized?.versionNo ?? null,
          personalizationAlgorithm: personalized?.algorithmVersion ?? null,
          householdPersonalizedVersionId: household?.id ?? null,
          householdPersonalizedVersionNo: household?.versionNo ?? null,
        },
        snapshot: this.snapshotFor(session),
        events: [...session.events]
          .sort((left, right) => left.clientSeq - right.clientSeq)
          .map((event) => ({
            id: event.id,
            eventType: event.eventType,
            clientSeq: event.clientSeq,
            clientTime: event.clientTime,
            serverTime: event.serverTime,
            payload: event.payload,
            schemaVersion: event.schemaVersion,
          })),
      },
    };
  }

  private async findSession(id: string, userId: string): Promise<SessionView> {
    const session = await this.prisma.cookSession.findFirst({
      where: { id, userId },
      include: {
        recipeVersion: { include: versionInclude },
        personalizedRecipeVersion: true,
        householdPersonalizedRecipeVersion: true,
        events: { orderBy: { clientSeq: 'asc' } },
      },
    });
    if (!session) throw new NotFoundException(`Cook session '${id}' was not found`);
    return session;
  }

  async start(userId: string, dto: StartCookSessionDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Current user was not found');

    let base: BaseVersion;
    let personalized: SessionView['personalizedRecipeVersion'] | null = null;
    let householdPersonalized: SessionView['householdPersonalizedRecipeVersion'] | null = null;

    if (dto.personalizedRecipeVersionId && dto.householdPersonalizedRecipeVersionId) {
      throw new BadRequestException('Choose either a personal or household personalized version.');
    }

    if (dto.householdPersonalizedRecipeVersionId) {
      const found = await this.prisma.householdPersonalizedRecipeVersion.findUnique({
        where: { id: dto.householdPersonalizedRecipeVersionId },
        include: { baseRecipeVersion: { include: versionInclude }, recipe: true, household: true },
      });
      const membership = found
        ? await this.prisma.householdMember.findUnique({ where: { userId } })
        : null;
      if (!found || !membership || membership.householdId !== found.householdId || found.household.status !== 'active') {
        throw new NotFoundException('Household personalized recipe version was not found');
      }
      if (found.recipe.slug !== dto.recipeSlug) {
        throw new BadRequestException('Household personalized recipe version does not belong to the requested recipe');
      }
      if (found.recipe.status !== 'published') throw new ConflictException('Recipe is not currently published');
      householdPersonalized = found;
      base = found.baseRecipeVersion;
    } else if (dto.personalizedRecipeVersionId) {
      const found = await this.prisma.personalizedRecipeVersion.findUnique({
        where: { id: dto.personalizedRecipeVersionId },
        include: { baseRecipeVersion: { include: versionInclude }, recipe: true },
      });
      if (!found || found.userId !== userId) {
        throw new NotFoundException('Personalized recipe version was not found');
      }
      if (found.recipe.slug !== dto.recipeSlug) {
        throw new BadRequestException('Personalized recipe version does not belong to the requested recipe');
      }
      if (found.recipe.status !== 'published') {
        throw new ConflictException('Recipe is not currently published');
      }
      personalized = found;
      base = found.baseRecipeVersion;
    } else {
      const recipe = await this.prisma.recipe.findFirst({
        where: { slug: dto.recipeSlug, status: 'published' },
        include: {
          versions: {
            where: { publishedAt: { not: null } },
            orderBy: { versionNo: 'desc' },
            take: 1,
            include: versionInclude,
          },
        },
      });
      if (!recipe || !recipe.versions[0]) {
        throw new NotFoundException(`Recipe '${dto.recipeSlug}' was not found`);
      }
      base = recipe.versions[0];
    }

    const personalizationSource = personalized ?? householdPersonalized;
    const personalizedData = personalizationSource ? asRecord(personalizationSource.snapshotJson) : {};
    const sourceServings = personalizationSource
      ? numberOr(personalizedData.servings, Number(base.servings))
      : Number(base.servings);
    const servings = dto.servings ?? sourceServings;
    const snapshot = this.buildSnapshot(base, servings, personalizationSource, householdPersonalized?.householdId ?? null);
    const startedAt = new Date();

    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`recipe-publish:${base.recipe.id}`}, 0)
        ) IS NULL AS locked
      `;
      const currentRecipe = await tx.recipe.findUnique({
        where: { id: base.recipe.id },
        select: { status: true },
      });
      if (currentRecipe?.status !== 'published') {
        throw new ConflictException('Recipe is not currently published');
      }
      if (householdPersonalized) {
        const activeMembership = await tx.householdMember.findUnique({ where: { userId } });
        if (!activeMembership || activeMembership.householdId !== householdPersonalized.householdId) {
          throw new NotFoundException('Household personalized recipe version was not found');
        }
      }
      const created = await tx.cookSession.create({
        data: {
          userId: user.id,
          recipeVersionId: base.id,
          personalizedRecipeVersionId: personalized?.id ?? null,
          householdPersonalizedRecipeVersionId: householdPersonalized?.id ?? null,
          status: 'started',
          servings,
          syncVersion: 1,
          snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
          startedAt,
        },
      });
      await tx.cookEvent.create({
        data: {
          id: randomUUID(),
          cookSessionId: created.id,
          eventType: 'session_started',
          clientSeq: 0,
          clientTime: startedAt,
          payload: {
            recipeId: base.recipe.id,
            recipeSlug: base.recipe.slug,
            recipeSource: householdPersonalized ? 'household' : personalized ? 'personalized' : 'canonical',
            baseRecipeVersion: base.versionNo,
            personalizedRecipeVersion: personalized?.versionNo ?? null,
            personalizedRecipeVersionId: personalized?.id ?? null,
            householdPersonalizedRecipeVersion: householdPersonalized?.versionNo ?? null,
            householdPersonalizedRecipeVersionId: householdPersonalized?.id ?? null,
            servings,
          },
          schemaVersion: 1,
        },
      });
      return created;
    });
    return this.get(userId, session.id);
  }

  async get(userId: string, id: string) {
    return this.serializeSession(await this.findSession(id, userId));
  }

  async latestActive(userId: string) {
    const session = await this.prisma.cookSession.findFirst({
      where: { userId, status: 'started' },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      include: {
        recipeVersion: { include: versionInclude },
        personalizedRecipeVersion: true,
        householdPersonalizedRecipeVersion: true,
        events: { orderBy: { clientSeq: 'asc' } },
      },
    });
    if (!session) throw new NotFoundException('No active cook session was found');
    return this.serializeSession(session);
  }

  async addEvent(userId: string, id: string, dto: AddCookEventDto) {
    const session = await this.prisma.cookSession.findFirst({ where: { id, userId } });
    if (!session) throw new NotFoundException(`Cook session '${id}' was not found`);
    if (session.status !== 'started') throw new ConflictException(`Cook session '${id}' is not active`);

    const existing = await this.prisma.cookEvent.findUnique({
      where: { cookSessionId_clientSeq: { cookSessionId: id, clientSeq: dto.clientSeq } },
    });
    if (existing) return { data: { ...existing, duplicate: true } };

    try {
      const event = await this.prisma.$transaction(async (tx) => {
        const created = await tx.cookEvent.create({
          data: {
            id: randomUUID(),
            cookSessionId: id,
            eventType: dto.eventType,
            clientSeq: dto.clientSeq,
            clientTime: new Date(dto.clientTime),
            payload: dto.payload as Prisma.InputJsonValue,
            schemaVersion: 1,
          },
        });
        await tx.cookSession.update({ where: { id }, data: { syncVersion: { increment: 1 } } });
        return created;
      });
      return { data: { ...event, duplicate: false } };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.cookEvent.findUnique({
          where: { cookSessionId_clientSeq: { cookSessionId: id, clientSeq: dto.clientSeq } },
        });
        if (duplicate) return { data: { ...duplicate, duplicate: true } };
      }
      throw error;
    }
  }

  async complete(userId: string, id: string) {
    const transition = await this.prisma.cookSession.updateMany({
      where: { id, userId, status: 'started' },
      data: { status: 'completed', completedAt: new Date(), syncVersion: { increment: 1 } },
    });
    if (transition.count === 0) {
      const current = await this.prisma.cookSession.findFirst({ where: { id, userId }, select: { status: true } });
      if (!current) throw new NotFoundException(`Cook session '${id}' was not found`);
      if (current.status !== 'completed') {
        throw new ConflictException(`Cook session '${id}' cannot be completed from status '${current.status}'`);
      }
    }
    return this.get(userId, id);
  }
}
