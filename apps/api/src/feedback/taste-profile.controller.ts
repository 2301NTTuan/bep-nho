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
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { FeedbackService } from './feedback.service';
import { ResetTasteDimensionDto } from './dto/reset-taste-dimension.dto';
import { TasteHistoryQuery } from './dto/taste-history.query';
import { UpdateTasteOverrideDto } from './dto/update-taste-override.dto';
import { ApiSessionProtected, ApiStandardErrors } from '../openapi/decorators';

@ApiTags('Taste DNA')
@ApiSessionProtected()
@Controller('me/taste-profile')
@UseGuards(SessionAuthGuard)
export class TasteProfileController {
  constructor(
    private readonly service:
      FeedbackService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user’s Taste DNA.' })
  @ApiResponse({ status: 200, description: 'Taste profile and dimensions.' })
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
  @ApiOperation({ summary: 'Get owner-scoped Taste signal/control history.' })
  @ApiResponse({ status: 200, description: 'Cursor-paginated Taste history.' })
  @ApiStandardErrors(400)
  history(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Query() query: TasteHistoryQuery,
  ) {
    return this.service.history(identity.userId, query);
  }

  @Patch('dimensions/:dimensionKey/override')
  @ApiOperation({ summary: 'Set or clear one manual Taste override.' })
  @ApiParam({ name: 'dimensionKey' })
  @ApiResponse({ status: 200, description: 'Updated Taste profile.' })
  @ApiStandardErrors(400, 404)
  override(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('dimensionKey') dimensionKey: string,
    @Body() dto: UpdateTasteOverrideDto,
  ) {
    return this.service.updateOverride(identity.userId, dimensionKey, dto.value);
  }

  @Post('dimensions/:dimensionKey/reset')
  @ApiOperation({ summary: 'Reset learning for one Taste dimension without deleting history.' })
  @ApiParam({ name: 'dimensionKey' })
  @ApiResponse({ status: 201, description: 'Updated Taste profile.' })
  @ApiStandardErrors(400, 404)
  reset(
    @CurrentUser() identity: AuthenticatedIdentity,
    @Param('dimensionKey') dimensionKey: string,
    @Body() _dto: ResetTasteDimensionDto,
  ) {
    return this.service.resetDimension(identity.userId, dimensionKey);
  }
}
