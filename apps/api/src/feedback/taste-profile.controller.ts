import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';

import { FeedbackService } from './feedback.service';

@Controller(
  'users/:userId/taste-profile',
)
export class TasteProfileController {
  constructor(
    private readonly service:
      FeedbackService,
  ) {}

  @Get()
  get(
    @Param(
      'userId',
      new ParseUUIDPipe(),
    )
    userId: string,
  ) {
    return this.service
      .getTasteProfile(
        userId,
      );
  }
}
