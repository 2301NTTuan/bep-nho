import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { TasteProfileController } from './taste-profile.controller';

@Module({
  imports: [AuthModule],
  controllers: [
    FeedbackController,
    TasteProfileController,
  ],

  providers: [
    FeedbackService,
  ],
})
export class FeedbackModule {}
