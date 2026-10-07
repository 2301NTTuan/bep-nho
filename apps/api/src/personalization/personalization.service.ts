import {
  createHash,
} from 'node:crypto';

import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  Prisma,
} from '@prisma/client';

import {
  PrismaService,
} from '../database/prisma.service';

const ENGINE_VERSION =
  'personalize-v1';

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
              Number(
                dimension
                  .confidence,
              );

            if (
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

            quantity,

            unit:
              row.unit,

            preparation:
              row.preparation,

            note:
              row.note,

            sortOrder:
              row.sortOrder,

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

    const hashInput = {
      algorithmVersion: ENGINE_VERSION,
      servings: snapshot.servings,
      prepTimeMinutes: snapshot.prepTimeMinutes,
      cookTimeMinutes: snapshot.cookTimeMinutes,
      summary: snapshot.summary,
      ingredients: ingredients.map((ingredient) => ({
        slug: ingredient.slug,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        preparation: ingredient.preparation,
        note: ingredient.note,
        sortOrder: ingredient.sortOrder,
      })),
      steps: snapshot.steps.map((step) => ({
        stepNo: step.stepNo,
        instruction: step.instruction,
        durationSeconds: step.durationSeconds,
        heatLevel: step.heatLevel,
        tip: step.tip,
      })),
    };

    const contentHash =
      this.hash(
        hashInput,
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
          contentHash,
          adjustmentJson: adjustments as Prisma.InputJsonValue,
          snapshotJson: snapshot as Prisma.InputJsonValue,
        },
      });

      return { version: created, reused: false };
    });

    const created = persisted.version;

    return {
      data: {
        id:
          created.id,

        versionNo:
          created.versionNo,

        algorithmVersion:
          created
            .algorithmVersion,

        createdAt:
          created.createdAt,

        reused:
          persisted.reused,

        snapshot:
          created.snapshotJson,
      },
    };
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

    return {
      data: {
        id:
          version.id,

        versionNo:
          version.versionNo,

        algorithmVersion:
          version
            .algorithmVersion,

        createdAt:
          version.createdAt,

        snapshot:
          version.snapshotJson,
      },
    };
  }
}
