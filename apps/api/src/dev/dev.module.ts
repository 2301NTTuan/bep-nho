import {
  Module,
} from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { AuthModule } from '../auth/auth.module';

import {
  DevController,
} from './dev.controller';

@Module({
  imports: [
    IdentityModule,
    AuthModule,
  ],

  controllers: [
    DevController,
  ],
})
export class DevModule {}
