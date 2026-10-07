import { Module } from '@nestjs/common';

import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { TasteProfileController } from './taste-profile.controller';

@Module({
  controllers: [
    FeedbackController,
    TasteProfileController,
  ],

  providers: [
    FeedbackService,
  ],
})
export class FeedbackModule {}
