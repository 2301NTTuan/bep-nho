import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { FeedbackService } from './feedback.service';

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
}
