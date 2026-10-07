import { Module } from '@nestjs/common';
import { CurrentUserService } from './current-user.service';

@Module({
  providers: [CurrentUserService],
  exports: [CurrentUserService],
})
export class IdentityModule {}
