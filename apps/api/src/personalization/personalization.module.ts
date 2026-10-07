import {
  Module,
} from '@nestjs/common';

import {
  PersonalizationController,
} from './personalization.controller';

import {
  PersonalizationService,
} from './personalization.service';

@Module({
  controllers: [
    PersonalizationController,
  ],

  providers: [
    PersonalizationService,
  ],
})
export class PersonalizationModule {}
