import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { FeedbackService } from './feedback.service';

@Controller('cook-sessions')
@UseGuards(SessionAuthGuard)
export class FeedbackController {
  constructor(
    private readonly service:
      FeedbackService,
  ) {}

  @Post(':id/feedback')
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
