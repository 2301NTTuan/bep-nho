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
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import {
  PersonalizationService,
} from './personalization.service';
import { PinBestVersionDto } from './dto/pin-best-version.dto';
import { ReviewAdjustmentDto } from './dto/review-adjustment.dto';
import { ApiSessionProtected, ApiStandardErrors } from '../openapi/decorators';

@ApiTags('Personalization')
@ApiSessionProtected()
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
  @ApiOperation({ summary: 'Create or reuse a Taste-engine personalized version.' })
  @ApiResponse({ status: 201, description: 'Personalized version.' })
  @ApiStandardErrors(404, 409, 422)
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
  @ApiOperation({ summary: 'Get the latest personalized version of any origin.' })
  @ApiResponse({ status: 200, description: 'Latest personalized version.' })
  @ApiResponse({ status: 404, description: 'No personalized version.' })
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
  @ApiOperation({ summary: 'Get latest engine, latest-any, and pinned best versions.' })
  @ApiResponse({ status: 200, description: 'Personalization overview.' })
  overview(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('slug') slug: string,
  ) {
    return this.service.overview(identity.userId, slug);
  }

  @Put('best')
  @ApiOperation({ summary: 'Pin an owned version as My Best Version.' })
  @ApiResponse({ status: 200, description: 'Updated personalization overview.' })
  @ApiStandardErrors(400, 404)
  pinBest(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('slug') slug: string,
    @Body() dto: PinBestVersionDto,
  ) {
    return this.service.pinBest(identity.userId, slug, dto.personalizedRecipeVersionId);
  }

  @Delete('best')
  @ApiOperation({ summary: 'Remove the My Best Version pin.' })
  @ApiResponse({ status: 200, description: 'Updated personalization overview.' })
  unpinBest(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('slug') slug: string,
  ) {
    return this.service.unpinBest(identity.userId, slug);
  }

  @Get(':versionId/decisions')
  @ApiOperation({ summary: 'List append-only decisions for an owned source version.' })
  @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Adjustment decisions.' })
  @ApiResponse({ status: 404, description: 'Version not found for current user/recipe.' })
  decisions(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('slug') slug: string,
    @Param('versionId') versionId: string,
  ) {
    return this.service.decisions(identity.userId, slug, versionId);
  }

  @Post(':versionId/adjustments/:ingredientSlug/decisions')
  @ApiOperation({ summary: 'Accept, reject, or edit an adjustment on the active source version.' })
  @ApiParam({ name: 'versionId', format: 'uuid' })
  @ApiParam({ name: 'ingredientSlug' })
  @ApiResponse({ status: 201, description: 'Recorded decision and optional result version.' })
  @ApiStandardErrors(400, 404, 409, 422)
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
