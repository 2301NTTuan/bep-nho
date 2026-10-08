import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TASTE_DIMENSION_KEYS, type TasteDimensionKey } from '@bep-nho/contracts';
import { effectiveTasteState, replayTasteSignals } from '@bep-nho/domain';
import { PrismaService } from '../database/prisma.service';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { TasteHistoryQuery } from './dto/taste-history.query';

export const TASTE_ALGORITHM_VERSION = 'taste-v1';
const SCOPE_TYPE = 'global';
const SCOPE_ID = '';

type Transaction = Prisma.TransactionClient;

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function encodeExclusionReasons(flags: string[]): string | null {
  return flags.length === 0 ? null : JSON.stringify([...new Set(flags)].sort());
}

function isTasteDimension(value: string): value is TasteDimensionKey {
  return (TASTE_DIMENSION_KEYS as readonly string[]).includes(value);
}

function explanation(
  score: number,
  confidence: number,
  sampleCount: number,
  manualOverride: number | null,
): string {
  if (manualOverride !== null) {
    return `Bạn đang ưu tiên thủ công mức ${manualOverride.toFixed(2)}; lựa chọn này được dùng với độ tin cậy 100%.`;
  }
  if (sampleCount === 0) return 'Chưa có phản hồi hợp lệ sau lần đặt lại gần nhất.';
  const direction = score > 0.05 ? 'đậm hơn' : score < -0.05 ? 'nhẹ hơn' : 'cân bằng';
  return `Học từ ${sampleCount} phản hồi hợp lệ: xu hướng ${direction}, độ tin cậy ${Math.round(confidence * 100)}%.`;
}

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  private async lockProfile(tx: Transaction, userId: string): Promise<void> {
    const profileLockKey = `taste-profile:${userId}:${TASTE_ALGORITHM_VERSION}`;
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${profileLockKey}, 0)
      ) IS NULL AS locked
    `;
  }

  private async ensureProfile(tx: Transaction, userId: string) {
    return tx.tasteProfile.upsert({
      where: {
        userId_algorithmVersion: { userId, algorithmVersion: TASTE_ALGORITHM_VERSION },
      },
      update: {},
      create: {
        userId,
        algorithmVersion: TASTE_ALGORITHM_VERSION,
        maturityScore: 0,
        sampleCount: 0,
      },
    });
  }

  private assertDimension(dimensionKey: string): asserts dimensionKey is TasteDimensionKey {
    if (!isTasteDimension(dimensionKey)) {
      throw new BadRequestException(`Unsupported taste dimension '${dimensionKey}'`);
    }
  }

  private async nextTimestamp(
    tx: Transaction,
    profileId: string,
    dimensionKey: string,
  ): Promise<Date> {
    const [signal, control] = await Promise.all([
      tx.tasteSignal.findFirst({
        where: { tasteProfileId: profileId, dimensionKey },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true },
      }),
      tx.tasteControlEvent.findFirst({
        where: { tasteProfileId: profileId, dimensionKey },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { createdAt: true },
      }),
    ]);
    const latest = Math.max(signal?.createdAt.getTime() ?? 0, control?.createdAt.getTime() ?? 0);
    return new Date(Math.max(Date.now(), latest + 1));
  }

  private async replayDimension(
    tx: Transaction,
    profileId: string,
    dimensionKey: string,
  ) {
    const reset = await tx.tasteControlEvent.findFirst({
      where: { tasteProfileId: profileId, dimensionKey, action: 'learning_reset' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { createdAt: true },
    });
    const signals = await tx.tasteSignal.findMany({
      where: {
        tasteProfileId: profileId,
        dimensionKey,
        ...(reset ? { createdAt: { gt: reset.createdAt } } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        signalValue: true,
        baseWeight: true,
        qualityFactor: true,
        excludedReason: true,
      },
    });
    return replayTasteSignals(signals.map((signal) => ({
      signalValue: Number(signal.signalValue),
      baseWeight: Number(signal.baseWeight),
      qualityFactor: Number(signal.qualityFactor),
      excludedReason: signal.excludedReason,
    })));
  }

  async submit(userId: string, cookSessionId: string, dto: SubmitFeedbackDto) {
    const dimensions = Object.entries(dto.dimensions ?? {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    );
    if (dimensions.length === 0) {
      throw new BadRequestException('At least one taste dimension is required');
    }

    const session = await this.prisma.cookSession.findFirst({
      where: { id: cookSessionId, userId },
      include: { feedback: true },
    });
    if (!session) throw new NotFoundException(`Cook session '${cookSessionId}' was not found`);
    if (session.status !== 'completed') {
      throw new ConflictException('Feedback can only be submitted for a completed cook session');
    }
    if (session.feedback) throw new ConflictException('Feedback already exists for this cook session');

    let result: {
      feedback: {
        id: string; cookSessionId: string; overallScore: Prisma.Decimal | null;
        dimensionJson: Prisma.JsonValue; technicalFlags: Prisma.JsonValue;
        privateNote: string | null; revisionNo: number; submittedAt: Date;
      };
    };

    try {
      result = await this.prisma.$transaction(async (tx) => {
        const feedback = await tx.cookFeedback.create({
          data: {
            cookSessionId,
            overallScore: dto.overallScore,
            dimensionJson: dto.dimensions as Prisma.InputJsonValue,
            technicalFlags: (dto.technicalFlags ?? []) as Prisma.InputJsonValue,
            privateNote: dto.privateNote,
            revisionNo: 1,
          },
        });
        const exclusionReason = encodeExclusionReasons(dto.technicalFlags ?? []);
        await this.lockProfile(tx, userId);
        let profile = await this.ensureProfile(tx, userId);

        for (const [dimensionKey, rawValue] of dimensions) {
          this.assertDimension(dimensionKey);
          const createdAt = await this.nextTimestamp(tx, profile.id, dimensionKey);
          await tx.tasteSignal.create({
            data: {
              tasteProfileId: profile.id,
              cookFeedbackId: feedback.id,
              dimensionKey,
              signalValue: clamp(rawValue),
              sourceType: 'cook_feedback',
              baseWeight: 1,
              qualityFactor: exclusionReason ? 0 : 1,
              excludedReason: exclusionReason,
              createdAt,
            },
          });

          if (exclusionReason) continue;
          const replayed = await this.replayDimension(tx, profile.id, dimensionKey);
          await tx.tasteDimension.upsert({
            where: {
              tasteProfileId_dimensionKey_scopeType_scopeId: {
                tasteProfileId: profile.id,
                dimensionKey,
                scopeType: SCOPE_TYPE,
                scopeId: SCOPE_ID,
              },
            },
            update: {
              score: replayed.score,
              confidence: replayed.confidence,
              effectiveWeight: replayed.effectiveWeight,
              sampleCount: replayed.sampleCount,
            },
            create: {
              tasteProfileId: profile.id,
              dimensionKey,
              scopeType: SCOPE_TYPE,
              scopeId: SCOPE_ID,
              score: replayed.score,
              confidence: replayed.confidence,
              effectiveWeight: replayed.effectiveWeight,
              sampleCount: replayed.sampleCount,
            },
          });
        }

        if (!exclusionReason) {
          const nextProfileSamples = profile.sampleCount + 1;
          profile = await tx.tasteProfile.update({
            where: { id: profile.id },
            data: {
              sampleCount: nextProfileSamples,
              maturityScore: Math.min(1, nextProfileSamples / 10),
              computedAt: new Date(),
            },
          });
        }
        return { feedback };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await this.prisma.cookFeedback.findUnique({
          where: { cookSessionId }, select: { id: true },
        });
        if (duplicate) throw new ConflictException('Feedback already exists for this cook session');
      }
      throw error;
    }

    const profile = await this.getTasteProfile(userId);
    return {
      data: {
        feedback: {
          id: result.feedback.id,
          cookSessionId: result.feedback.cookSessionId,
          overallScore: result.feedback.overallScore === null ? null : Number(result.feedback.overallScore),
          dimensions: result.feedback.dimensionJson,
          technicalFlags: result.feedback.technicalFlags,
          privateNote: result.feedback.privateNote,
          revisionNo: result.feedback.revisionNo,
          submittedAt: result.feedback.submittedAt,
        },
        tasteProfile: profile.data,
      },
    };
  }

  async getTasteProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException(`User '${userId}' was not found`);

    const profileId = await this.prisma.$transaction(async (tx) => {
      await this.lockProfile(tx, userId);
      return (await this.ensureProfile(tx, userId)).id;
    });
    const profile = await this.prisma.tasteProfile.findUniqueOrThrow({
      where: { id: profileId },
      include: { dimensions: { orderBy: { dimensionKey: 'asc' } } },
    });
    const stored = new Map(profile.dimensions
      .filter((dimension) => dimension.scopeType === SCOPE_TYPE && dimension.scopeId === SCOPE_ID)
      .map((dimension) => [dimension.dimensionKey, dimension]));
    const keys = [...new Set([...TASTE_DIMENSION_KEYS, ...stored.keys()])].sort();

    return {
      data: {
        id: profile.id,
        userId: profile.userId,
        algorithmVersion: profile.algorithmVersion,
        maturityScore: Number(profile.maturityScore),
        sampleCount: profile.sampleCount,
        computedAt: profile.computedAt,
        dimensions: keys.map((key) => {
          const dimension = stored.get(key);
          const score = dimension ? Number(dimension.score) : 0;
          const confidence = dimension ? Number(dimension.confidence) : 0;
          const sampleCount = dimension?.sampleCount ?? 0;
          const manualOverride = dimension?.manualOverride === null || !dimension
            ? null
            : Number(dimension.manualOverride);
          const effective = effectiveTasteState({
            score,
            confidence,
            sampleCount,
            effectiveWeight: dimension ? Number(dimension.effectiveWeight) : 0,
            manualOverride,
          });
          return {
            key,
            scopeType: SCOPE_TYPE,
            scopeId: SCOPE_ID,
            score,
            confidence,
            effectiveWeight: dimension ? Number(dimension.effectiveWeight) : 0,
            sampleCount,
            manualOverride,
            effectiveScore: effective.score,
            effectiveConfidence: effective.confidence,
            explanation: explanation(score, confidence, sampleCount, manualOverride),
          };
        }),
      },
    };
  }

  async updateOverride(userId: string, dimensionKey: string, value: number | null) {
    this.assertDimension(dimensionKey);
    await this.prisma.$transaction(async (tx) => {
      await this.lockProfile(tx, userId);
      const profile = await this.ensureProfile(tx, userId);
      await tx.tasteDimension.upsert({
        where: {
          tasteProfileId_dimensionKey_scopeType_scopeId: {
            tasteProfileId: profile.id, dimensionKey, scopeType: SCOPE_TYPE, scopeId: SCOPE_ID,
          },
        },
        update: { manualOverride: value },
        create: {
          tasteProfileId: profile.id, dimensionKey, scopeType: SCOPE_TYPE, scopeId: SCOPE_ID,
          manualOverride: value,
        },
      });
      await tx.tasteControlEvent.create({
        data: {
          tasteProfileId: profile.id,
          dimensionKey,
          action: value === null ? 'manual_override_cleared' : 'manual_override_set',
          value,
          createdAt: await this.nextTimestamp(tx, profile.id, dimensionKey),
        },
      });
    });
    return this.getTasteProfile(userId);
  }

  async resetDimension(userId: string, dimensionKey: string) {
    this.assertDimension(dimensionKey);
    await this.prisma.$transaction(async (tx) => {
      await this.lockProfile(tx, userId);
      const profile = await this.ensureProfile(tx, userId);
      const createdAt = await this.nextTimestamp(tx, profile.id, dimensionKey);
      await tx.tasteDimension.upsert({
        where: {
          tasteProfileId_dimensionKey_scopeType_scopeId: {
            tasteProfileId: profile.id, dimensionKey, scopeType: SCOPE_TYPE, scopeId: SCOPE_ID,
          },
        },
        update: { score: 0, confidence: 0, effectiveWeight: 0, sampleCount: 0, manualOverride: null },
        create: {
          tasteProfileId: profile.id, dimensionKey, scopeType: SCOPE_TYPE, scopeId: SCOPE_ID,
        },
      });
      await tx.tasteControlEvent.create({
        data: { tasteProfileId: profile.id, dimensionKey, action: 'learning_reset', createdAt },
      });
    });
    return this.getTasteProfile(userId);
  }

  async history(userId: string, query: TasteHistoryQuery) {
    const profile = await this.prisma.tasteProfile.findUnique({
      where: { userId_algorithmVersion: { userId, algorithmVersion: TASTE_ALGORITHM_VERSION } },
      select: { id: true },
    });
    if (!profile) return { data: [], meta: { count: 0, nextCursor: null } };

    let boundary: { createdAt: Date; id: string } | null = null;
    if (query.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(query.cursor, 'base64url').toString('utf8')) as { t: string; id: string };
        const createdAt = new Date(decoded.t);
        if (!decoded.id || Number.isNaN(createdAt.getTime())) throw new Error('invalid');
        boundary = { createdAt, id: decoded.id };
      } catch {
        throw new BadRequestException('Invalid taste history cursor');
      }
    }
    const pageWhere = boundary ? {
      OR: [
        { createdAt: { lt: boundary.createdAt } },
        { createdAt: boundary.createdAt, id: { lt: boundary.id } },
      ],
    } : {};
    const common = {
      tasteProfileId: profile.id,
      ...(query.dimension ? { dimensionKey: query.dimension } : {}),
      ...pageWhere,
    };
    const take = query.limit + 1;
    const [signals, controls] = await Promise.all([
      this.prisma.tasteSignal.findMany({
        where: common,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        include: {
          cookFeedback: {
            include: {
              cookSession: {
                include: {
                  recipeVersion: { include: { recipe: true } },
                  personalizedRecipeVersion: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.tasteControlEvent.findMany({
        where: common,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
      }),
    ]);
    const events = [
      ...signals.map((signal) => ({
        id: signal.id,
        kind: 'signal' as const,
        dimensionKey: signal.dimensionKey,
        createdAt: signal.createdAt,
        signal: {
          value: Number(signal.signalValue),
          sourceType: signal.sourceType,
          baseWeight: Number(signal.baseWeight),
          qualityFactor: Number(signal.qualityFactor),
          excludedReason: signal.excludedReason,
          cookFeedbackId: signal.cookFeedbackId,
          cookSessionId: signal.cookFeedback?.cookSessionId ?? null,
          recipeSlug: signal.cookFeedback?.cookSession.recipeVersion.recipe.slug ?? null,
          recipeTitle: signal.cookFeedback?.cookSession.recipeVersion.recipe.canonicalTitle ?? null,
          canonicalRecipeVersionId: signal.cookFeedback?.cookSession.recipeVersionId ?? null,
          canonicalRecipeVersionNo: signal.cookFeedback?.cookSession.recipeVersion.versionNo ?? null,
          personalizedRecipeVersionId: signal.cookFeedback?.cookSession.personalizedRecipeVersionId ?? null,
          personalizedRecipeVersionNo:
            signal.cookFeedback?.cookSession.personalizedRecipeVersion?.versionNo ?? null,
          personalizationAlgorithm:
            signal.cookFeedback?.cookSession.personalizedRecipeVersion?.algorithmVersion ?? null,
          overallScore: signal.cookFeedback?.overallScore === null || !signal.cookFeedback
            ? null : Number(signal.cookFeedback.overallScore),
          dimensions: signal.cookFeedback?.dimensionJson ?? null,
          technicalFlags: signal.cookFeedback?.technicalFlags ?? null,
          privateNote: signal.cookFeedback?.privateNote ?? null,
        },
      })),
      ...controls.map((control) => ({
        id: control.id,
        kind: 'control' as const,
        dimensionKey: control.dimensionKey,
        createdAt: control.createdAt,
        control: {
          action: control.action,
          value: control.value === null ? null : Number(control.value),
        },
      })),
    ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()
      || right.id.localeCompare(left.id));
    const page = events.slice(0, query.limit);
    const hasMore = events.length > query.limit;
    const last = page.at(-1);
    const nextCursor = hasMore && last
      ? Buffer.from(JSON.stringify({ t: last.createdAt.toISOString(), id: last.id })).toString('base64url')
      : null;
    return { data: page, meta: { count: page.length, nextCursor } };
  }
}
