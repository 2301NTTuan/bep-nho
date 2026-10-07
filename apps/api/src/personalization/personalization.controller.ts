import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import {
  PersonalizationService,
} from './personalization.service';

@Controller(
  'users/:userId/recipes/:slug/personalized-versions',
)
export class PersonalizationController {
  constructor(
    private readonly service:
      PersonalizationService,
  ) {}

  @Post()
  create(
    @Param(
      'userId',
      new ParseUUIDPipe(),
    )
    userId: string,

    @Param('slug')
    slug: string,
  ) {
    return this.service
      .createVersion(
        userId,
        slug,
      );
  }

  @Get('latest')
  latest(
    @Param(
      'userId',
      new ParseUUIDPipe(),
    )
    userId: string,

    @Param('slug')
    slug: string,
  ) {
    return this.service.latest(
      userId,
      slug,
    );
  }
}
