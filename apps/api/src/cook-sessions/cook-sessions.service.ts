import {
  randomUUID,
} from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  Prisma,
} from '@prisma/client';

import {
  PrismaService,
} from '../database/prisma.service';

import {
  AddCookEventDto,
} from './dto/add-cook-event.dto';

import {
  StartCookSessionDto,
} from './dto/start-cook-session.dto';

type SessionView =
  Prisma.CookSessionGetPayload<{
    include: {
      recipeVersion: {
        include: {
          recipe: true;
        };
      };

      personalizedRecipeVersion:
        true;

      events: true;
    };
  }>;

@Injectable()
export class CookSessionsService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  private serializeSession(
    session: SessionView,
  ) {
    const personalized =
      session
        .personalizedRecipeVersion;

    return {
      data: {
        id:
          session.id,

        userId:
          session.userId,

        status:
          session.status,

        servings:
          Number(
            session.servings,
          ),

        syncVersion:
          session.syncVersion,

        startedAt:
          session.startedAt,

        completedAt:
          session.completedAt,

        recipe: {
          id:
            session
              .recipeVersion
              .recipe
              .id,

          slug:
            session
              .recipeVersion
              .recipe
              .slug,

          title:
            session
              .recipeVersion
              .recipe
              .canonicalTitle,

          source:
            personalized
              ? 'personalized'
              : 'canonical',

          versionId:
            session
              .recipeVersion
              .id,

          versionNo:
            session
              .recipeVersion
              .versionNo,

          personalizedVersionId:
            personalized
              ?.id ?? null,

          personalizedVersionNo:
            personalized
              ?.versionNo ?? null,

          personalizationAlgorithm:
            personalized
              ?.algorithmVersion ??
            null,
        },

        events:
          session.events
            .sort(
              (a, b) =>
                a.clientSeq -
                b.clientSeq,
            )
            .map(
              (event) => ({
                id:
                  event.id,

                eventType:
                  event.eventType,

                clientSeq:
                  event.clientSeq,

                clientTime:
                  event.clientTime,

                serverTime:
                  event.serverTime,

                payload:
                  event.payload,

                schemaVersion:
                  event.schemaVersion,
              }),
            ),
      },
    };
  }

  private async findSession(
    id: string,
  ) {
    const session =
      await this.prisma
        .cookSession
        .findUnique({
          where: {
            id,
          },

          include: {
            recipeVersion: {
              include: {
                recipe: true,
              },
            },

            personalizedRecipeVersion:
              true,

            events: {
              orderBy: {
                clientSeq:
                  'asc',
              },
            },
          },
        });

    if (!session) {
      throw new NotFoundException(
        `Cook session '${id}' was not found`,
      );
    }

    return session;
  }

  async start(
    dto: StartCookSessionDto,
  ) {
    const user =
      await this.prisma.user
        .findUnique({
          where: {
            id: dto.userId,
          },
        });

    if (!user) {
      throw new NotFoundException(
        `User '${dto.userId}' was not found`,
      );
    }

    let recipeId:
      string;

    let recipeSlug:
      string;

    let baseVersionId:
      string;

    let baseVersionNo:
      number;

    let defaultServings:
      number;

    let personalizedId:
      string | null =
      null;

    let personalizedVersionNo:
      number | null =
      null;

    if (
      dto
        .personalizedRecipeVersionId
    ) {
      const personalized =
        await this.prisma
          .personalizedRecipeVersion
          .findUnique({
            where: {
              id:
                dto
                  .personalizedRecipeVersionId,
            },

            include: {
              recipe: true,

              baseRecipeVersion:
                true,
            },
          });

      if (
        !personalized ||
        personalized.userId !==
          dto.userId
      ) {
        throw new NotFoundException(
          'Personalized recipe version was not found',
        );
      }

      if (
        personalized
          .recipe
          .slug !==
        dto.recipeSlug
      ) {
        throw new BadRequestException(
          'Personalized recipe version does not belong to the requested recipe',
        );
      }

      if (
        personalized
          .recipe
          .status !==
        'published'
      ) {
        throw new ConflictException(
          'Recipe is not currently published',
        );
      }

      recipeId =
        personalized.recipe.id;

      recipeSlug =
        personalized.recipe.slug;

      baseVersionId =
        personalized
          .baseRecipeVersion
          .id;

      baseVersionNo =
        personalized
          .baseRecipeVersion
          .versionNo;

      const snapshotServings = (
        personalized.snapshotJson as
          Prisma.JsonObject
      ).servings;

      if (
        typeof snapshotServings !== 'number' ||
        !Number.isFinite(snapshotServings) ||
        snapshotServings <= 0
      ) {
        throw new ConflictException(
          'Personalized recipe snapshot has invalid servings',
        );
      }

      defaultServings = snapshotServings;

      personalizedId =
        personalized.id;

      personalizedVersionNo =
        personalized.versionNo;
    } else {
      const recipe =
        await this.prisma.recipe
          .findFirst({
            where: {
              slug:
                dto.recipeSlug,

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
              },
            },
          });

      if (
        !recipe ||
        !recipe.versions[0]
      ) {
        throw new NotFoundException(
          `Recipe '${dto.recipeSlug}' was not found`,
        );
      }

      const base =
        recipe.versions[0];

      recipeId =
        recipe.id;

      recipeSlug =
        recipe.slug;

      baseVersionId =
        base.id;

      baseVersionNo =
        base.versionNo;

      defaultServings =
        Number(
          base.servings,
        );
    }

    const servings =
      defaultServings;

    const startedAt =
      new Date();

    const session =
      await this.prisma
        .$transaction(
          async (tx) => {
            const created =
              await tx
                .cookSession
                .create({
                  data: {
                    userId:
                      user.id,

                    recipeVersionId:
                      baseVersionId,

                    personalizedRecipeVersionId:
                      personalizedId,

                    status:
                      'started',

                    servings,

                    syncVersion:
                      1,

                    startedAt,
                  },
                });

            await tx
              .cookEvent
              .create({
                data: {
                  id:
                    randomUUID(),

                  cookSessionId:
                    created.id,

                  eventType:
                    'session_started',

                  clientSeq:
                    0,

                  clientTime:
                    startedAt,

                  payload: {
                    recipeId,

                    recipeSlug,

                    recipeSource:
                      personalizedId
                        ? 'personalized'
                        : 'canonical',

                    baseRecipeVersion:
                      baseVersionNo,

                    personalizedRecipeVersion:
                      personalizedVersionNo,

                    personalizedRecipeVersionId:
                      personalizedId,

                    servings,
                  },

                  schemaVersion:
                    1,
                },
              });

            return created;
          },
        );

    return this.get(
      session.id,
    );
  }

  async get(
    id: string,
  ) {
    const session =
      await this.findSession(
        id,
      );

    return this.serializeSession(
      session,
    );
  }

  async addEvent(
    id: string,
    dto: AddCookEventDto,
  ) {
    const existing =
      await this.prisma
        .cookEvent
        .findUnique({
          where: {
            cookSessionId_clientSeq:
              {
                cookSessionId:
                  id,

                clientSeq:
                  dto.clientSeq,
              },
          },
        });

    if (existing) {
      return {
        data: {
          id:
            existing.id,

          eventType:
            existing.eventType,

          clientSeq:
            existing.clientSeq,

          clientTime:
            existing.clientTime,

          serverTime:
            existing.serverTime,

          payload:
            existing.payload,

          schemaVersion:
            existing
              .schemaVersion,

          duplicate:
            true,
        },
      };
    }

    const session =
      await this.prisma
        .cookSession
        .findUnique({
          where: {
            id,
          },
        });

    if (!session) {
      throw new NotFoundException(
        `Cook session '${id}' was not found`,
      );
    }

    if (
      session.status !==
      'started'
    ) {
      throw new ConflictException(
        `Cook session '${id}' is not active`,
      );
    }

    try {
      const event =
        await this.prisma
          .$transaction(
            async (tx) => {
              const created =
                await tx
                  .cookEvent
                  .create({
                    data: {
                      id:
                        randomUUID(),

                      cookSessionId:
                        id,

                      eventType:
                        dto.eventType,

                      clientSeq:
                        dto.clientSeq,

                      clientTime:
                        new Date(
                          dto.clientTime,
                        ),

                      payload:
                        dto.payload as
                          Prisma.InputJsonValue,

                      schemaVersion:
                        1,
                    },
                  });

              await tx
                .cookSession
                .update({
                  where: {
                    id,
                  },

                  data: {
                    syncVersion: {
                      increment:
                        1,
                    },
                  },
                });

              return created;
            },
          );

      return {
        data: {
          id:
            event.id,

          eventType:
            event.eventType,

          clientSeq:
            event.clientSeq,

          clientTime:
            event.clientTime,

          serverTime:
            event.serverTime,

          payload:
            event.payload,

          schemaVersion:
            event.schemaVersion,

          duplicate:
            false,
        },
      };
    } catch (error) {
      if (
        error instanceof
          Prisma
            .PrismaClientKnownRequestError &&
        error.code ===
          'P2002'
      ) {
        const duplicate =
          await this.prisma
            .cookEvent
            .findUnique({
              where: {
                cookSessionId_clientSeq:
                  {
                    cookSessionId:
                      id,

                    clientSeq:
                      dto.clientSeq,
                  },
              },
            });

        if (duplicate) {
          return {
            data: {
              id:
                duplicate.id,

              eventType:
                duplicate
                  .eventType,

              clientSeq:
                duplicate
                  .clientSeq,

              clientTime:
                duplicate
                  .clientTime,

              serverTime:
                duplicate
                  .serverTime,

              payload:
                duplicate
                  .payload,

              schemaVersion:
                duplicate
                  .schemaVersion,

              duplicate:
                true,
            },
          };
        }
      }

      throw error;
    }
  }

  async complete(
    id: string,
  ) {
    const transition = await this.prisma
      .cookSession
      .updateMany({
        where: {
          id,
          status: 'started',
        },
        data: {
          status: 'completed',
          completedAt: new Date(),
          syncVersion: { increment: 1 },
        },
      });

    if (transition.count === 0) {
      const current = await this.prisma.cookSession.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!current) {
        throw new NotFoundException(
          `Cook session '${id}' was not found`,
        );
      }

      if (current.status !== 'completed') {
        throw new ConflictException(
          `Cook session '${id}' cannot be completed from status '${current.status}'`,
        );
      }
    }

    return this.get(id);
  }
}
