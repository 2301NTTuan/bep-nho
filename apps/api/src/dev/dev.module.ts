import {
  Module,
} from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';

import {
  DevController,
} from './dev.controller';

@Module({
  imports: [
    IdentityModule,
  ],

  controllers: [
    DevController,
  ],
})
export class DevModule {}
