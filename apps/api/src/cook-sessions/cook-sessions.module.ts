import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';

import { CookSessionsController } from './cook-sessions.controller';
import { CookSessionsService } from './cook-sessions.service';

@Module({
  imports: [AuthModule],
  controllers: [
    CookSessionsController,
  ],

  providers: [
    CookSessionsService,
  ],
})
export class CookSessionsModule {}
