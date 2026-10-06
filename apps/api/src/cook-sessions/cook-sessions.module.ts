import { Module } from '@nestjs/common';

import { CookSessionsController } from './cook-sessions.controller';
import { CookSessionsService } from './cook-sessions.service';

@Module({
  controllers: [
    CookSessionsController,
  ],

  providers: [
    CookSessionsService,
  ],
})
export class CookSessionsModule {}
