import {
  Controller,
  Get,
  NotFoundException,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  PrismaService,
} from '../database/prisma.service';

@Controller('dev')
export class DevController {
  constructor(
    private readonly prisma:
      PrismaService,

    private readonly config:
      ConfigService,
  ) {}

  @Get('bootstrap')
  async bootstrap() {
    const environment =
      this.config.get<string>(
        'NODE_ENV',
        'development',
      );

    if (
      environment ===
      'production'
    ) {
      throw new NotFoundException();
    }

    const user =
      await this.prisma.user
        .findUnique({
          where: {
            authSubject:
              'dev-local-user',
          },
        });

    if (!user) {
      throw new NotFoundException(
        'Local development user was not found. Run the database seed first.',
      );
    }

    const tasteProfile =
      await this.prisma
        .tasteProfile
        .findFirst({
          where: {
            userId:
              user.id,

            algorithmVersion:
              'taste-v1',
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

    return {
      data: {
        environment,

        user: {
          id:
            user.id,

          locale:
            user.locale,

          timezone:
            user.timezone,
        },

        tasteProfile:
          tasteProfile
            ? {
                id:
                  tasteProfile.id,

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
                      }),
                    ),
              }
            : null,
      },
    };
  }
}
