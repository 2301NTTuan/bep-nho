import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

import { CookSessionsService } from './cook-sessions.service';
import { AddCookEventDto } from './dto/add-cook-event.dto';
import { StartCookSessionDto } from './dto/start-cook-session.dto';

@Controller('cook-sessions')
export class CookSessionsController {
  constructor(
    private readonly service:
      CookSessionsService,
  ) {}

  @Post()
  start(
    @Body()
    dto: StartCookSessionDto,
  ) {
    return this.service.start(
      dto,
    );
  }

  @Get(':id')
  get(
    @Param(
      'id',
      new ParseUUIDPipe(),
    )
    id: string,
  ) {
    return this.service.get(
      id,
    );
  }

  @Post(':id/events')
  addEvent(
    @Param(
      'id',
      new ParseUUIDPipe(),
    )
    id: string,

    @Body()
    dto: AddCookEventDto,
  ) {
    return this.service.addEvent(
      id,
      dto,
    );
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @Param(
      'id',
      new ParseUUIDPipe(),
    )
    id: string,
  ) {
    return this.service.complete(
      id,
    );
  }
}
