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
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedIdentity } from '../auth/auth.types';
import { CookSessionsService } from './cook-sessions.service';
import { AddCookEventDto } from './dto/add-cook-event.dto';
import { StartCookSessionDto } from './dto/start-cook-session.dto';
import { ApiSessionProtected, ApiStandardErrors } from '../openapi/decorators';

@ApiTags('Cook sessions')
@ApiSessionProtected()
@Controller('cook-sessions')
@UseGuards(SessionAuthGuard)
export class CookSessionsController {
  constructor(
    private readonly service:
      CookSessionsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Start an immutable, snapshotted cooking session.' })
  @ApiResponse({ status: 201, description: 'Cooking session started.' })
  @ApiStandardErrors(400, 404, 409)
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
  @ApiOperation({ summary: 'Get an owned cooking session.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Cooking session and ordered events.' })
  @ApiResponse({ status: 404, description: 'Session not found for current user.' })
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
  @ApiOperation({ summary: 'Append an idempotent client-sequenced cooking event.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Event appended or existing duplicate returned.' })
  @ApiStandardErrors(400, 404, 409)
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
  @ApiOperation({ summary: 'Complete a cooking session after required steps.' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Completed session.' })
  @ApiStandardErrors(404, 409)
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

@ApiTags('Cook sessions')
@ApiSessionProtected()
@Controller('me/cook-sessions')
@UseGuards(SessionAuthGuard)
export class MeCookSessionsController {
  constructor(private readonly service: CookSessionsService) {}

  @Get('active')
  @ApiOperation({ summary: 'Get the current user’s newest active cooking session.' })
  @ApiResponse({ status: 200, description: 'Newest active session.' })
  @ApiResponse({ status: 404, description: 'No active session.' })
  active(
    @CurrentUser() identity: AuthenticatedIdentity,
  ) {
    return this.service.latestActive(identity.userId);
  }
}
