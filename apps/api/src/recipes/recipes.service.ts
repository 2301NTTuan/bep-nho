import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class RecipesService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async list(limit: number) {
    const recipes =
      await this.prisma.recipe.findMany({
        where: {
          status: 'published',

          versions: {
            some: {
              publishedAt: {
                not: null,
              },
            },
          },
        },

        orderBy: {
          canonicalTitle: 'asc',
        },

        take: limit,

        include: {
          versions: {
            where: {
              publishedAt: {
                not: null,
              },
            },

            orderBy: {
              versionNo: 'desc',
            },

            take: 1,
          },
        },
      });

    return {
      data: recipes.map(
        (recipe) => {
          const latest =
            recipe.versions[0];

          return {
            id: recipe.id,
            slug: recipe.slug,

            title:
              recipe.canonicalTitle,

            cuisine:
              recipe.cuisine,

            latestVersion: latest
              ? {
                  versionNo:
                    latest.versionNo,

                  servings:
                    Number(
                      latest.servings,
                    ),

                  prepTimeMinutes:
                    latest
                      .prepTimeMinutes,

                  cookTimeMinutes:
                    latest
                      .cookTimeMinutes,

                  summary:
                    latest.summary,

                  publishedAt:
                    latest
                      .publishedAt,
                }
              : null,
          };
        },
      ),

      meta: {
        count:
          recipes.length,
      },
    };
  }

  async detail(slug: string) {
    const recipe =
      await this.prisma.recipe.findFirst({
        where: {
          slug,
          status: 'published',
        },

        include: {
          versions: {
            where: {
              publishedAt: {
                not: null,
              },
            },

            orderBy: {
              versionNo: 'desc',
            },

            take: 1,

            include: {
              ingredients: {
                orderBy: {
                  sortOrder: 'asc',
                },

                include: {
                  ingredient: true,
                },
              },

              steps: {
                orderBy: {
                  stepNo: 'asc',
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

    const version =
      recipe.versions[0];

    return {
      data: {
        id: recipe.id,
        slug: recipe.slug,

        title:
          recipe.canonicalTitle,

        cuisine:
          recipe.cuisine,

        version: {
          id: version.id,

          versionNo:
            version.versionNo,

          servings:
            Number(
              version.servings,
            ),

          prepTimeMinutes:
            version
              .prepTimeMinutes,

          cookTimeMinutes:
            version
              .cookTimeMinutes,

          summary:
            version.summary,

          publishedAt:
            version.publishedAt,

          ingredients:
            version.ingredients.map(
              (row) => ({
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

                quantity:
                  Number(
                    row.quantity,
                  ),

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
              }),
            ),

          steps:
            version.steps.map(
              (step) => ({
                stepNo:
                  step.stepNo,

                instruction:
                  step.instruction,

                durationSeconds:
                  step
                    .durationSeconds,

                heatLevel:
                  step.heatLevel,

                tip:
                  step.tip,
              }),
            ),
        },
      },
    };
  }
}
