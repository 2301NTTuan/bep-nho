import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { ApiExcludeController } from '@nestjs/swagger';

type MetricsResponse = {
  setHeader(name: string, value: string): void;
  send(body: string): void;
};

@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async get(@Res() response: MetricsResponse): Promise<void> {
    if (!this.metrics.enabled()) throw new NotFoundException();
    response.setHeader('Content-Type', this.metrics.registry.contentType);
    response.send(await this.metrics.registry.metrics());
  }
}
