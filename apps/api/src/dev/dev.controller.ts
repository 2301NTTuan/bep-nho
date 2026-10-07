import { Controller, Get, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUserService } from '../identity/current-user.service';

@Controller('dev')
export class DevController {
  constructor(
    private readonly currentUser: CurrentUserService,
    private readonly config: ConfigService,
  ) {}

  @Get('bootstrap')
  async bootstrap() {
    const environment = this.config.get<string>('NODE_ENV', 'development');

    if (environment === 'production') {
      throw new NotFoundException();
    }

    const context = await this.currentUser.resolveByAuthSubject('dev-local-user');

    return {
      data: {
        environment,
        ...context,
      },
    };
  }
}
