import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

import { CookSessionsController, MeCookSessionsController } from './cook-sessions.controller';
import { CookSessionsService } from './cook-sessions.service';

@Module({
  imports: [AuthModule],
  controllers: [
    CookSessionsController,
    MeCookSessionsController,
  ],

  providers: [
    CookSessionsService,
  ],
})
export class CookSessionsModule {}
