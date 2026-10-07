import {
  Module,
} from '@nestjs/common';

import {
  DatabaseModule,
} from '../database/database.module';

import {
  DevController,
} from './dev.controller';

@Module({
  imports: [
    DatabaseModule,
  ],

  controllers: [
    DevController,
  ],
})
export class DevModule {}
