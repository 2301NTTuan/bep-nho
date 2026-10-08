import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import {
  PersonalizationService,
} from './personalization.service';

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
}
