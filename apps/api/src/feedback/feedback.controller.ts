import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { FeedbackService } from './feedback.service';
import { ApiSessionProtected, ApiStandardErrors } from '../openapi/decorators';

@ApiTags('Feedback')
@ApiSessionProtected()
@Controller('cook-sessions')
@UseGuards(SessionAuthGuard)
export class FeedbackController {
  constructor(
    private readonly service:
      FeedbackService,
  ) {}

  @Post(':id/feedback')
  @ApiOperation({ summary: 'Submit explicit Taste feedback for a completed cook.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Feedback and Taste learning result.' })
  @ApiStandardErrors(400, 404, 409)
  submit(
    @CurrentUser()
    identity: AuthenticatedIdentity,

    @Param(
      'id',
      new ParseUUIDPipe(),
    )
    id: string,

    @Body()
    dto: SubmitFeedbackDto,
  ) {
    return this.service.submit(
      identity.userId,
      id,
      dto,
    );
  }
}
