import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { CookSessionsService } from './cook-sessions.service';
import { AddCookEventDto } from './dto/add-cook-event.dto';
import { StartCookSessionDto } from './dto/start-cook-session.dto';

@Controller('cook-sessions')
@UseGuards(SessionAuthGuard)
export class CookSessionsController {
  constructor(
    private readonly service:
      CookSessionsService,
  ) {}

  @Post()
  start(
    @CurrentUser()
    identity: AuthenticatedIdentity,

    @Body()
    dto: StartCookSessionDto,
  ) {
    return this.service.start(
      identity.userId,
      dto,
    );
  }

  @Get(':id')
  get(
    @CurrentUser()
    identity: AuthenticatedIdentity,

    @Param(
      'id',
      new ParseUUIDPipe(),
    )
    id: string,
  ) {
    return this.service.get(
      identity.userId,
      id,
    );
  }

  @Post(':id/events')
  addEvent(
    @CurrentUser()
    identity: AuthenticatedIdentity,

    @Param(
      'id',
      new ParseUUIDPipe(),
    )
    id: string,

    @Body()
    dto: AddCookEventDto,
  ) {
    return this.service.addEvent(
      identity.userId,
      id,
      dto,
    );
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentUser()
    identity: AuthenticatedIdentity,

    @Param(
      'id',
      new ParseUUIDPipe(),
    )
    id: string,
  ) {
    return this.service.complete(
      identity.userId,
      id,
    );
  }
}

@Controller('me/cook-sessions')
@UseGuards(SessionAuthGuard)
export class MeCookSessionsController {
  constructor(private readonly service: CookSessionsService) {}

  @Get('active')
  active(
    @CurrentUser() identity: AuthenticatedIdentity,
  ) {
    return this.service.latestActive(identity.userId);
  }
}
