import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import {
  SubmitFeedbackDto,
} from './dto/submit-feedback.dto';

const ALGORITHM_VERSION =
  'taste-v1';

const SCOPE_TYPE =
  'global';

const SCOPE_ID =
  '';

function clamp(
  value: number,
): number {
  return Math.max(
    -1,
    Math.min(1, value),
  );
}

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async submit(
    cookSessionId: string,
    dto: SubmitFeedbackDto,
  ) {
    const dimensions =
      Object.entries(
        dto.dimensions ?? {},
      ).filter(
        (
          entry,
        ): entry is [
          string,
          number,
        ] =>
          typeof entry[1] ===
          'number',
      );

    if (
      dimensions.length === 0
    ) {
      throw new BadRequestException(
        'At least one taste dimension is required',
      );
    }

    const session =
      await this.prisma
        .cookSession
        .findUnique({
          where: {
            id: cookSessionId,
          },

          include: {
            feedback: true,
          },
        });

    if (!session) {
      throw new NotFoundException(
        `Cook session '${cookSessionId}' was not found`,
      );
    }

    if (
      session.status !==
      'completed'
    ) {
      throw new ConflictException(
        'Feedback can only be submitted for a completed cook session',
      );
    }

    if (session.feedback) {
      throw new ConflictException(
        'Feedback already exists for this cook session',
      );
    }

    const result =
      await this.prisma
        .$transaction(
          async (tx) => {
            let profile =
              await tx.tasteProfile
                .findFirst({
                  where: {
                    userId:
                      session.userId,

                    algorithmVersion:
                      ALGORITHM_VERSION,
                  },

                  orderBy: {
                    computedAt:
                      'desc',
                  },
                });

            if (!profile) {
              profile =
                await tx.tasteProfile
                  .create({
                    data: {
                      userId:
                        session.userId,

                      algorithmVersion:
                        ALGORITHM_VERSION,

                      maturityScore:
                        0,

                      sampleCount:
                        0,
                    },
                  });
            }

            const feedback =
              await tx.cookFeedback
                .create({
                  data: {
                    cookSessionId,

                    overallScore:
                      dto.overallScore,

                    dimensionJson:
                      dto.dimensions as
                        Prisma.InputJsonValue,

                    technicalFlags:
                      (
                        dto
                          .technicalFlags ??
                        []
                      ) as
                        Prisma.InputJsonValue,

                    privateNote:
                      dto.privateNote,

                    revisionNo:
                      1,
                  },
                });

            const exclusionReason =
              dto.technicalFlags?.[0] ?? null;

            for (
              const [
                dimensionKey,
                rawValue,
              ] of dimensions
            ) {
              const signalValue =
                clamp(rawValue);

              if (exclusionReason) {
                await tx.tasteSignal.create({
                  data: {
                    tasteProfileId: profile.id,
                    dimensionKey,
                    signalValue,
                    sourceType: 'cook_feedback',
                    baseWeight: 1,
                    qualityFactor: 0,
                    excludedReason: exclusionReason,
                  },
                });

                continue;
              }

              const current =
                await tx
                  .tasteDimension
                  .findUnique({
                    where: {
                      tasteProfileId_dimensionKey_scopeType_scopeId:
                        {
                          tasteProfileId:
                            profile.id,

                          dimensionKey,

                          scopeType:
                            SCOPE_TYPE,

                          scopeId:
                            SCOPE_ID,
                        },
                    },
                  });

              const oldScore =
                current
                  ? Number(
                      current.score,
                    )
                  : 0;

              const oldWeight =
                current
                  ? Number(
                      current
                        .effectiveWeight,
                    )
                  : 0;

              const oldSamples =
                current
                  ?.sampleCount ??
                0;

              const signalWeight =
                1;

              const newWeight =
                oldWeight +
                signalWeight;

              const newScore =
                clamp(
                  (
                    oldScore *
                      oldWeight +
                    signalValue *
                      signalWeight
                  ) /
                    newWeight,
                );

              const newSamples =
                oldSamples + 1;

              const confidence =
                Math.min(
                  1,
                  newSamples / 5,
                );

              await tx
                .tasteSignal
                .create({
                  data: {
                    tasteProfileId:
                      profile.id,

                    dimensionKey,

                    signalValue,

                    sourceType:
                      'cook_feedback',

                    baseWeight:
                      signalWeight,

                    qualityFactor:
                      1,
                  },
                });

              await tx
                .tasteDimension
                .upsert({
                  where: {
                    tasteProfileId_dimensionKey_scopeType_scopeId:
                      {
                        tasteProfileId:
                          profile.id,

                        dimensionKey,

                        scopeType:
                          SCOPE_TYPE,

                        scopeId:
                          SCOPE_ID,
                      },
                  },

                  update: {
                    score:
                      newScore,

                    confidence,

                    effectiveWeight:
                      newWeight,

                    sampleCount:
                      newSamples,
                  },

                  create: {
                    tasteProfileId:
                      profile.id,

                    dimensionKey,

                    scopeType:
                      SCOPE_TYPE,

                    scopeId:
                      SCOPE_ID,

                    score:
                      newScore,

                    confidence,

                    effectiveWeight:
                      newWeight,

                    sampleCount:
                      newSamples,
                  },
                });
            }

            const nextProfileSamples =
              profile.sampleCount +
              (exclusionReason ? 0 : 1);

            const maturityScore =
              Math.min(
                1,
                nextProfileSamples /
                  10,
              );

            profile =
              await tx.tasteProfile
                .update({
                  where: {
                    id:
                      profile.id,
                  },

                  data: {
                    sampleCount:
                      nextProfileSamples,

                    maturityScore,

                    computedAt:
                      new Date(),
                  },
                });

            return {
              feedback,
              profileId:
                profile.id,
            };
          },
        );

    const profile =
      await this.getTasteProfile(
        session.userId,
      );

    return {
      data: {
        feedback: {
          id:
            result.feedback.id,

          cookSessionId:
            result.feedback
              .cookSessionId,

          overallScore:
            result.feedback
              .overallScore === null
              ? null
              : Number(
                  result.feedback
                    .overallScore,
                ),

          dimensions:
            result.feedback
              .dimensionJson,

          technicalFlags:
            result.feedback
              .technicalFlags,

          privateNote:
            result.feedback
              .privateNote,

          revisionNo:
            result.feedback
              .revisionNo,

          submittedAt:
            result.feedback
              .submittedAt,
        },

        tasteProfile:
          profile.data,
      },
    };
  }

  async getTasteProfile(
    userId: string,
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

    const profile =
      await this.prisma
        .tasteProfile
        .findFirst({
          where: {
            userId,

            algorithmVersion:
              ALGORITHM_VERSION,
          },

          orderBy: {
            computedAt:
              'desc',
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

    if (!profile) {
      throw new NotFoundException(
        `Taste profile for user '${userId}' was not found`,
      );
    }

    return {
      data: {
        id:
          profile.id,

        userId:
          profile.userId,

        algorithmVersion:
          profile
            .algorithmVersion,

        maturityScore:
          Number(
            profile.maturityScore,
          ),

        sampleCount:
          profile.sampleCount,

        computedAt:
          profile.computedAt,

        dimensions:
          profile.dimensions.map(
            (dimension) => ({
              key:
                dimension
                  .dimensionKey,

              scopeType:
                dimension
                  .scopeType,

              scopeId:
                dimension
                  .scopeId,

              score:
                Number(
                  dimension.score,
                ),

              confidence:
                Number(
                  dimension
                    .confidence,
                ),

              effectiveWeight:
                Number(
                  dimension
                    .effectiveWeight,
                ),

              sampleCount:
                dimension
                  .sampleCount,

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
  }
}
