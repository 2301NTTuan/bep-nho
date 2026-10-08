import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import {
  PersonalizationService,
} from './personalization.service';
import { PinBestVersionDto } from './dto/pin-best-version.dto';
import { ReviewAdjustmentDto } from './dto/review-adjustment.dto';

@Controller(
  'me/recipes/:slug/personalized-versions',
)
@UseGuards(SessionAuthGuard)
export class PersonalizationController {
  constructor(
    private readonly service:
      PersonalizationService,
  ) {}

  @Post()
  create(
    @CurrentUser()
    identity: AuthenticatedIdentity,

    @Param('slug')
    slug: string,
  ) {
    return this.service
      .createVersion(
        identity.userId,
        slug,
      );
  }

  @Get('latest')
  latest(
    @CurrentUser()
    identity: AuthenticatedIdentity,

    @Param('slug')
    slug: string,
  ) {
    return this.service.latest(
      identity.userId,
      slug,
    );
  }

  @Get('overview')
  overview(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('slug') slug: string,
  ) {
    return this.service.overview(identity.userId, slug);
  }

  @Put('best')
  pinBest(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('slug') slug: string,
    @Body() dto: PinBestVersionDto,
  ) {
    return this.service.pinBest(identity.userId, slug, dto.personalizedRecipeVersionId);
  }

  @Delete('best')
  unpinBest(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('slug') slug: string,
  ) {
    return this.service.unpinBest(identity.userId, slug);
  }

  @Get(':versionId/decisions')
  decisions(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('slug') slug: string,
    @Param('versionId') versionId: string,
  ) {
    return this.service.decisions(identity.userId, slug, versionId);
  }

  @Post(':versionId/adjustments/:ingredientSlug/decisions')
  decide(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('slug') slug: string,
    @Param('versionId') versionId: string,
    @Param('ingredientSlug') ingredientSlug: string,
    @Body() dto: ReviewAdjustmentDto,
  ) {
    return this.service.decide(
      identity.userId,
      slug,
      versionId,
      ingredientSlug,
      dto.action,
      dto.quantity,
    );
  }
}
