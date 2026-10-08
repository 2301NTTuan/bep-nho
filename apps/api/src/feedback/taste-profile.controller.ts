import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { FeedbackService } from './feedback.service';
import { ResetTasteDimensionDto } from './dto/reset-taste-dimension.dto';
import { TasteHistoryQuery } from './dto/taste-history.query';
import { UpdateTasteOverrideDto } from './dto/update-taste-override.dto';

@Controller('me/taste-profile')
@UseGuards(SessionAuthGuard)
export class TasteProfileController {
  constructor(
    private readonly service:
      FeedbackService,
  ) {}

  @Get()
  get(
    @CurrentUser()
    identity: AuthenticatedIdentity,
  ) {
    return this.service
      .getTasteProfile(
        identity.userId,
      );
  }

  @Get('history')
  history(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Query() query: TasteHistoryQuery,
  ) {
    return this.service.history(identity.userId, query);
  }

  @Patch('dimensions/:dimensionKey/override')
  override(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('dimensionKey') dimensionKey: string,
    @Body() dto: UpdateTasteOverrideDto,
  ) {
    return this.service.updateOverride(identity.userId, dimensionKey, dto.value);
  }

  @Post('dimensions/:dimensionKey/reset')
  reset(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('dimensionKey') dimensionKey: string,
    @Body() _dto: ResetTasteDimensionDto,
  ) {
    return this.service.resetDimension(identity.userId, dimensionKey);
  }
}
