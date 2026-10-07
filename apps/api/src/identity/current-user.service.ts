import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class CurrentUserService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveByAuthSubject(authSubject: string) {
    const user = await this.prisma.user.findUnique({
      where: { authSubject },
    });

    if (!user) {
      throw new NotFoundException('Current user was not found.');
    }

    const tasteProfile = await this.prisma.tasteProfile.findFirst({
      where: { userId: user.id, algorithmVersion: 'taste-v1' },
      orderBy: { computedAt: 'desc' },
      include: { dimensions: { orderBy: { dimensionKey: 'asc' } } },
    });

    return {
      user: {
        id: user.id,
        locale: user.locale,
        timezone: user.timezone,
      },
      tasteProfile: tasteProfile
        ? {
            id: tasteProfile.id,
            sampleCount: tasteProfile.sampleCount,
            maturityScore: Number(tasteProfile.maturityScore),
            dimensions: tasteProfile.dimensions.map((dimension) => ({
              key: dimension.dimensionKey,
              score: Number(dimension.score),
              confidence: Number(dimension.confidence),
            })),
          }
        : null,
    };
  }
}
