import {
  createHash,
} from 'node:crypto';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  Prisma,
} from '@prisma/client';
import type {
  PersonalizedAdjustmentAction,
  PersonalizedSnapshot,
} from '@bep-nho/contracts';

import {
  PrismaService,
} from '../database/prisma.service';

const ENGINE_VERSION =
  'personalize-v3';

const TASTE_VERSION =
  'taste-v1';

const MIN_CONFIDENCE =
  0.2;

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(
    max,
    Math.max(
      min,
      value,
    ),
  );
}

function roundQuantity(
  value: number,
): number {
  return Math.round(
    value * 1000,
  ) / 1000;
}

@Injectable()
export class PersonalizationService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  private hash(
    value: unknown,
  ): string {
    return createHash(
      'sha256',
    )
      .update(
        JSON.stringify(value),
      )
      .digest('hex');
  }

  private effectiveContent(
    snapshot: PersonalizedSnapshot,
    algorithmVersion: string,
  ) {
    return {
      algorithmVersion,
      recipe: snapshot.recipe,
      baseVersion: snapshot.baseVersion,
      servings: snapshot.servings,
      prepTimeMinutes: snapshot.prepTimeMinutes,
      cookTimeMinutes: snapshot.cookTimeMinutes,
      summary: snapshot.summary,
      ingredients: snapshot.ingredients.map((ingredient) => ({
        slug: ingredient.slug,
        quantity: ingredient.quantity,
        personalizationFactor: ingredient.personalizationFactor,
        unit: ingredient.unit,
        preparation: ingredient.preparation,
        note: ingredient.note,
        sortOrder: ingredient.sortOrder,
        scalingMode: ingredient.scalingMode,
        scalingExponent: ingredient.scalingExponent,
        roundingIncrement: ingredient.roundingIncrement,
      })),
      steps: snapshot.steps.map((step) => ({
        stepNo: step.stepNo,
        instruction: step.instruction,
        durationSeconds: step.durationSeconds,
        heatLevel: step.heatLevel,
        tip: step.tip,
      })),
    };
  }

  private serializeVersion(version: {
    id: string;
    versionNo: number;
    algorithmVersion: string;
    originType: string;
    parentPersonalizedRecipeVersionId: string | null;
    createdAt: Date;
    snapshotJson: Prisma.JsonValue;
  }) {
    return {
      id: version.id,
      versionNo: version.versionNo,
      algorithmVersion: version.algorithmVersion,
      originType: version.originType,
      parentPersonalizedRecipeVersionId: version.parentPersonalizedRecipeVersionId,
      createdAt: version.createdAt,
      snapshot: version.snapshotJson,
    };
  }

  async createVersion(
    userId: string,
    slug: string,
  ) {
    const user =
      await this.prisma.user
        .findUnique({
          where: {
            id: userId,
          },
        });

    if (!user) {
      throw new NotFoundException(
        `User '${userId}' was not found`,
      );
    }

    const recipe =
      await this.prisma.recipe
        .findFirst({
          where: {
            slug,
            status:
              'published',
          },

          include: {
            versions: {
              where: {
                publishedAt: {
                  not: null,
                },
              },

              orderBy: {
                versionNo:
                  'desc',
              },

              take: 1,

              include: {
                ingredients: {
                  orderBy: {
                    sortOrder:
                      'asc',
                  },

                  include: {
                    ingredient:
                      true,
                  },
                },

                steps: {
                  orderBy: {
                    stepNo:
                      'asc',
                  },
                },

                adjustmentRules: {
                  orderBy: {
                    dimensionKey:
                      'asc',
                  },
                },
              },
            },
          },
        });

    if (
      !recipe ||
      !recipe.versions[0]
    ) {
      throw new NotFoundException(
        `Recipe '${slug}' was not found`,
      );
    }

    const base =
      recipe.versions[0];

    const tasteProfile =
      await this.prisma
        .tasteProfile
        .findUnique({
          where: {
            userId_algorithmVersion: {
              userId,
              algorithmVersion: TASTE_VERSION,
            },
          },

          include: {
            dimensions: {
              orderBy: {
                dimensionKey:
                  'asc',
              },
            },
          },
        });

    if (!tasteProfile) {
      throw new NotFoundException(
        `Taste profile for user '${userId}' was not found`,
      );
    }

    const dimensions =
      new Map(
        tasteProfile
          .dimensions
          .filter(
            (dimension) =>
              dimension
                .scopeType ===
                'global' &&
              dimension
                .scopeId ===
                '',
          )
          .map(
            (dimension) => [
              dimension
                .dimensionKey,

              dimension,
            ],
          ),
      );

    const rulesByIngredient =
      new Map<
        string,
        typeof base.adjustmentRules
      >();

    for (
      const rule
      of base.adjustmentRules
    ) {
      const existing =
        rulesByIngredient.get(
          rule.ingredientId,
        ) ?? [];

      existing.push(rule);

      rulesByIngredient.set(
        rule.ingredientId,
        existing,
      );
    }

    const adjustments:
      Array<Record<string, unknown>> =
      [];

    const ingredients =
      base.ingredients.map(
        (row) => {
          const baseQuantity =
            Number(
              row.quantity,
            );

          let factor =
            1;

          const appliedRules:
            Array<Record<string, unknown>> =
            [];

          for (
            const rule
            of (
              rulesByIngredient.get(
                row.ingredientId,
              ) ?? []
            )
          ) {
            const dimension =
              dimensions.get(
                rule.dimensionKey,
              );

            if (!dimension) {
              continue;
            }

            const confidence =
              dimension.manualOverride === null
                ? Number(dimension.confidence)
                : 1;

            if (
              dimension.manualOverride === null &&
              confidence <
              MIN_CONFIDENCE
            ) {
              continue;
            }

            const score =
              dimension
                .manualOverride ===
              null
                ? Number(
                    dimension
                      .score,
                  )
                : Number(
                    dimension
                      .manualOverride,
                  );

            const sensitivity =
              Number(
                rule.sensitivity,
              );

            const minFactor =
              Number(
                rule.minFactor,
              );

            const maxFactor =
              Number(
                rule.maxFactor,
              );

            const ruleFactor =
              clamp(
                1 +
                  score *
                    confidence *
                    sensitivity,

                minFactor,
                maxFactor,
              );

            factor *=
              ruleFactor;

            appliedRules.push({
              dimension:
                rule.dimensionKey,

              score,

              confidence,

              sensitivity,

              factor:
                ruleFactor,
            });
          }

          const quantity =
            roundQuantity(
              baseQuantity *
                factor,
            );

          const deltaPercent =
            baseQuantity === 0
              ? 0
              : Math.round(
                  (
                    (
                      quantity -
                      baseQuantity
                    ) /
                    baseQuantity
                  ) *
                    10000,
                ) / 100;

          if (
            appliedRules.length >
            0
          ) {
            adjustments.push({
              ingredientSlug:
                row.ingredient.slug,

              ingredientName:
                row.ingredient
                  .canonicalName,

              baseQuantity,

              quantity,

              unit:
                row.unit,

              deltaPercent,

              reviewStatus:
                'pending',

              originType:
                'taste_engine',

              rules:
                appliedRules,
            });
          }

          return {
            id:
              row.ingredient.id,

            slug:
              row.ingredient.slug,

            name:
              row.ingredient
                .canonicalName,

            category:
              row.ingredient
                .category,

            baseQuantity,

            personalizationFactor:
              factor,

            quantity,

            unit:
              row.unit,

            preparation:
              row.preparation,

            note:
              row.note,

            sortOrder:
              row.sortOrder,

            scalingMode:
              row.scalingMode,

            scalingExponent:
              Number(row.scalingExponent),

            roundingIncrement:
              row.roundingIncrement === null
                ? null
                : Number(row.roundingIncrement),

            personalized:
              appliedRules.length >
              0,

            deltaPercent,

            appliedRules,
          };
        },
      );

    const snapshot = {
      recipe: {
        id:
          recipe.id,

        slug:
          recipe.slug,

        title:
          recipe
            .canonicalTitle,

        cuisine:
          recipe.cuisine,
      },

      baseVersion: {
        id:
          base.id,

        versionNo:
          base.versionNo,
      },

      servings:
        Number(
          base.servings,
        ),

      prepTimeMinutes:
        base.prepTimeMinutes,

      cookTimeMinutes:
        base.cookTimeMinutes,

      summary:
        base.summary,

      ingredients,

      steps:
        base.steps.map(
          (step) => ({
            stepNo:
              step.stepNo,

            instruction:
              step.instruction,

            durationSeconds:
              step.durationSeconds,

            heatLevel:
              step.heatLevel,

            tip:
              step.tip,
          }),
        ),

      adjustments,

      tasteEvidence: {
        tasteProfileId:
          tasteProfile.id,

        algorithmVersion:
          tasteProfile
            .algorithmVersion,

        sampleCount:
          tasteProfile
            .sampleCount,

        maturityScore:
          Number(
            tasteProfile
              .maturityScore,
          ),

        dimensions:
          tasteProfile
            .dimensions
            .map(
              (
                dimension,
              ) => ({
                key:
                  dimension
                    .dimensionKey,

                score:
                  Number(
                    dimension
                      .score,
                  ),

                confidence:
                  Number(
                    dimension
                      .confidence,
                  ),

                manualOverride:
                  dimension
                    .manualOverride ===
                  null
                    ? null
                    : Number(
                        dimension
                          .manualOverride,
                      ),
              }),
            ),
      },
    };

    const contentHash =
      this.hash(
        this.effectiveContent(
          snapshot as unknown as PersonalizedSnapshot,
          ENGINE_VERSION,
        ),
      );

    const persisted = await this.prisma.$transaction(async (tx) => {
      const lockKey = `${userId}:${recipe.id}`;

      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${lockKey}, 0)
        ) IS NULL AS locked
      `;

      const existing = await tx.personalizedRecipeVersion.findUnique({
        where: {
          userId_recipeId_contentHash: {
            userId,
            recipeId: recipe.id,
            contentHash,
          },
        },
      });

      if (existing) {
        return { version: existing, reused: true };
      }

      const aggregate = await tx.personalizedRecipeVersion.aggregate({
        where: { userId, recipeId: recipe.id },
        _max: { versionNo: true },
      });
      const nextVersion = Math.max(
        base.versionNo + 1,
        (aggregate._max.versionNo ?? base.versionNo) + 1,
      );
      const created = await tx.personalizedRecipeVersion.create({
        data: {
          userId,
          recipeId: recipe.id,
          baseRecipeVersionId: base.id,
          tasteProfileId: tasteProfile.id,
          versionNo: nextVersion,
          algorithmVersion: ENGINE_VERSION,
          originType: 'taste_engine',
          contentHash,
          adjustmentJson: adjustments as Prisma.InputJsonValue,
          snapshotJson: snapshot as Prisma.InputJsonValue,
        },
      });

      return { version: created, reused: false };
    });

    const created = persisted.version;

    return { data: { ...this.serializeVersion(created), reused: persisted.reused } };
  }

  async latest(
    userId: string,
    slug: string,
  ) {
    const recipe =
      await this.prisma.recipe
        .findUnique({
          where: {
            slug,
          },
        });

    if (!recipe) {
      throw new NotFoundException(
        `Recipe '${slug}' was not found`,
      );
    }

    const version =
      await this.prisma
        .personalizedRecipeVersion
        .findFirst({
          where: {
            userId,

            recipeId:
              recipe.id,
          },

          orderBy: {
            versionNo:
              'desc',
          },
        });

    if (!version) {
      throw new NotFoundException(
        'Personalized recipe version was not found',
      );
    }

    return { data: this.serializeVersion(version) };
  }

  async overview(userId: string, slug: string) {
    const recipe = await this.prisma.recipe.findUnique({ where: { slug } });
    if (!recipe) throw new NotFoundException(`Recipe '${slug}' was not found`);
    const [latestEngine, latestAny, preference] = await Promise.all([
      this.prisma.personalizedRecipeVersion.findFirst({
        where: { userId, recipeId: recipe.id, originType: 'taste_engine' },
        orderBy: { versionNo: 'desc' },
      }),
      this.prisma.personalizedRecipeVersion.findFirst({
        where: { userId, recipeId: recipe.id },
        orderBy: { versionNo: 'desc' },
      }),
      this.prisma.userRecipePreference.findUnique({
        where: { userId_recipeId: { userId, recipeId: recipe.id } },
        include: { bestVersion: true },
      }),
    ]);
    return {
      data: {
        latestEngine: latestEngine ? this.serializeVersion(latestEngine) : null,
        latestAny: latestAny ? this.serializeVersion(latestAny) : null,
        bestVersion: preference?.bestVersion ? this.serializeVersion(preference.bestVersion) : null,
      },
    };
  }

  async pinBest(userId: string, slug: string, versionId: string) {
    const version = await this.prisma.personalizedRecipeVersion.findFirst({
      where: { id: versionId, userId, recipe: { slug } },
      include: { recipe: true },
    });
    if (!version) throw new NotFoundException('Personalized recipe version was not found');
    await this.prisma.userRecipePreference.upsert({
      where: { userId_recipeId: { userId, recipeId: version.recipeId } },
      update: { bestPersonalizedRecipeVersionId: version.id },
      create: {
        userId,
        recipeId: version.recipeId,
        bestPersonalizedRecipeVersionId: version.id,
      },
    });
    return { data: this.serializeVersion(version) };
  }

  async unpinBest(userId: string, slug: string) {
    const recipe = await this.prisma.recipe.findUnique({ where: { slug }, select: { id: true } });
    if (!recipe) throw new NotFoundException(`Recipe '${slug}' was not found`);
    await this.prisma.userRecipePreference.upsert({
      where: { userId_recipeId: { userId, recipeId: recipe.id } },
      update: { bestPersonalizedRecipeVersionId: null },
      create: { userId, recipeId: recipe.id, bestPersonalizedRecipeVersionId: null },
    });
    return { data: { bestVersion: null } };
  }

  async decisions(userId: string, slug: string, sourceVersionId: string) {
    const source = await this.prisma.personalizedRecipeVersion.findFirst({
      where: { id: sourceVersionId, userId, recipe: { slug } },
      select: { id: true },
    });
    if (!source) throw new NotFoundException('Personalized recipe version was not found');
    const decisions = await this.prisma.personalizedAdjustmentDecision.findMany({
      where: { userId, sourcePersonalizedRecipeVersionId: source.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { ingredient: true, resultVersion: true },
    });
    return {
      data: decisions.map((decision) => ({
        id: decision.id,
        action: decision.action,
        ingredientId: decision.ingredientId,
        ingredientSlug: decision.ingredient.slug,
        sourcePersonalizedRecipeVersionId: decision.sourcePersonalizedRecipeVersionId,
        resultPersonalizedRecipeVersionId: decision.resultPersonalizedRecipeVersionId,
        editedQuantity: decision.editedQuantity === null ? null : Number(decision.editedQuantity),
        createdAt: decision.createdAt,
        resultVersion: decision.resultVersion ? this.serializeVersion(decision.resultVersion) : null,
      })),
    };
  }

  async decide(
    userId: string,
    slug: string,
    sourceVersionId: string,
    ingredientSlug: string,
    action: PersonalizedAdjustmentAction,
    editedQuantity?: number,
  ) {
    const source = await this.prisma.personalizedRecipeVersion.findFirst({
      where: { id: sourceVersionId, userId, recipe: { slug } },
      include: { recipe: true },
    });
    if (!source) throw new NotFoundException('Personalized recipe version was not found');
    const snapshot = structuredClone(source.snapshotJson) as unknown as PersonalizedSnapshot;
    const ingredient = snapshot.ingredients.find((item) => item.slug === ingredientSlug);
    const adjusted = snapshot.adjustments.some((item) => item.ingredientSlug === ingredientSlug);
    if (!ingredient || !adjusted) {
      throw new BadRequestException('Only adjusted ingredients can be reviewed');
    }

    const rules = await this.prisma.recipeAdjustmentRule.findMany({
      where: { recipeVersionId: source.baseRecipeVersionId, ingredientId: ingredient.id },
      orderBy: { dimensionKey: 'asc' },
    });
    if (rules.length === 0) throw new BadRequestException('Adjustment rules were not found');
    const minFactor = rules.reduce((value, rule) => value * Number(rule.minFactor), 1);
    const maxFactor = rules.reduce((value, rule) => value * Number(rule.maxFactor), 1);
    const baseQuantity = ingredient.baseQuantity;
    let quantity = ingredient.quantity;

    if (action === 'EDIT') {
      if (editedQuantity === undefined || !Number.isFinite(editedQuantity) || editedQuantity <= 0) {
        throw new BadRequestException('A positive edited quantity is required');
      }
      const factor = editedQuantity / baseQuantity;
      if (factor < minFactor - 0.000001 || factor > maxFactor + 0.000001) {
        throw new BadRequestException(
          `Edited quantity must stay between ${roundQuantity(baseQuantity * minFactor)} and ${roundQuantity(baseQuantity * maxFactor)} ${ingredient.unit}`,
        );
      }
      quantity = roundQuantity(editedQuantity);
    } else if (action === 'REJECT') {
      quantity = baseQuantity;
    }

    const persisted = await this.prisma.$transaction(async (tx) => {
      const lockKey = `${userId}:${source.recipeId}`;
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${lockKey}, 0)
        ) IS NULL AS locked
      `;

      let resultVersion = null;
      if (action !== 'ACCEPT') {
        const nextSnapshot = structuredClone(snapshot);
        const priorDecisions = await tx.personalizedAdjustmentDecision.findMany({
          where: { userId, sourcePersonalizedRecipeVersionId: source.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        });
        const latestDecisionByIngredient = new Map<string, string>();
        for (const prior of priorDecisions) {
          if (!latestDecisionByIngredient.has(prior.ingredientId)) {
            latestDecisionByIngredient.set(prior.ingredientId, prior.action);
          }
        }
        nextSnapshot.adjustments = nextSnapshot.adjustments
          .filter((item) => latestDecisionByIngredient.get(
            nextSnapshot.ingredients.find((ingredient) => ingredient.slug === item.ingredientSlug)?.id ?? '',
          ) !== 'REJECT')
          .map((item) => {
            const itemIngredient = nextSnapshot.ingredients.find(
              (candidate) => candidate.slug === item.ingredientSlug,
            );
            const priorAction = itemIngredient
              ? latestDecisionByIngredient.get(itemIngredient.id)
              : undefined;
            return priorAction === 'ACCEPT' || priorAction === 'EDIT'
              ? {
                  ...item,
                  reviewStatus: priorAction === 'ACCEPT' ? 'accepted' as const : 'edited' as const,
                  originType: priorAction === 'EDIT' ? 'user_edit' as const : item.originType,
                }
              : item;
          });
        const nextIngredient = nextSnapshot.ingredients.find((item) => item.slug === ingredientSlug);
        if (!nextIngredient) throw new BadRequestException('Adjusted ingredient was not found');
        const factor = baseQuantity === 0 ? 1 : quantity / baseQuantity;
        nextIngredient.quantity = quantity;
        nextIngredient.personalizationFactor = factor;
        nextIngredient.personalized = Math.abs(factor - 1) > 0.000001;
        nextIngredient.deltaPercent = baseQuantity === 0
          ? 0
          : Math.round(((quantity - baseQuantity) / baseQuantity) * 10000) / 100;
        nextSnapshot.adjustments = action === 'REJECT'
          ? nextSnapshot.adjustments.filter((item) => item.ingredientSlug !== ingredientSlug)
          : nextSnapshot.adjustments.map((item) => item.ingredientSlug === ingredientSlug
            ? {
                ...item,
                quantity,
                deltaPercent: nextIngredient.deltaPercent,
                reviewStatus: 'edited',
                originType: 'user_edit',
              }
            : item);

        const contentHash = this.hash(this.effectiveContent(nextSnapshot, source.algorithmVersion));
        resultVersion = await tx.personalizedRecipeVersion.findUnique({
          where: {
            userId_recipeId_contentHash: { userId, recipeId: source.recipeId, contentHash },
          },
        });
        if (!resultVersion) {
          const aggregate = await tx.personalizedRecipeVersion.aggregate({
            where: { userId, recipeId: source.recipeId },
            _max: { versionNo: true },
          });
          resultVersion = await tx.personalizedRecipeVersion.create({
            data: {
              userId,
              recipeId: source.recipeId,
              baseRecipeVersionId: source.baseRecipeVersionId,
              tasteProfileId: source.tasteProfileId,
              versionNo: Math.max(source.versionNo + 1, (aggregate._max.versionNo ?? source.versionNo) + 1),
              algorithmVersion: source.algorithmVersion,
              originType: 'user_edit',
              parentPersonalizedRecipeVersionId: source.id,
              contentHash,
              adjustmentJson: nextSnapshot.adjustments as Prisma.InputJsonValue,
              snapshotJson: nextSnapshot as unknown as Prisma.InputJsonValue,
            },
          });
        }
      }

      const decision = await tx.personalizedAdjustmentDecision.create({
        data: {
          userId,
          recipeId: source.recipeId,
          sourcePersonalizedRecipeVersionId: source.id,
          resultPersonalizedRecipeVersionId: resultVersion?.id ?? null,
          ingredientId: ingredient.id,
          action,
          editedQuantity: action === 'EDIT' ? quantity : null,
        },
      });
      return { decision, resultVersion };
    });

    return {
      data: {
        id: persisted.decision.id,
        action: persisted.decision.action,
        ingredientId: persisted.decision.ingredientId,
        ingredientSlug,
        sourcePersonalizedRecipeVersionId: persisted.decision.sourcePersonalizedRecipeVersionId,
        resultPersonalizedRecipeVersionId: persisted.decision.resultPersonalizedRecipeVersionId,
        editedQuantity: persisted.decision.editedQuantity === null
          ? null : Number(persisted.decision.editedQuantity),
        createdAt: persisted.decision.createdAt,
        resultVersion: persisted.resultVersion ? this.serializeVersion(persisted.resultVersion) : null,
      },
    };
  }
}
