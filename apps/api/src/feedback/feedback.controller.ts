import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { FeedbackService } from './feedback.service';

@Controller('cook-sessions')
export class FeedbackController {
  constructor(
    private readonly service:
      FeedbackService,
  ) {}

  @Post(':id/feedback')
  submit(
    @Param(
      'id',
      new ParseUUIDPipe(),
    )
    id: string,

    @Body()
    dto: SubmitFeedbackDto,
  ) {
    return this.service.submit(
      id,
      dto,
    );
  }
}
