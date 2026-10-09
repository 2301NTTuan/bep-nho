import {
  Controller,
  Get,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Process liveness; does not require dependencies.' })
  @ApiResponse({ status: 200, description: 'Process is alive.' })
  liveness() {
    return {
      status: 'ok',
      service: 'bep-nho-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness for PostgreSQL and Redis.' })
  @ApiResponse({ status: 200, description: 'Required dependencies are reachable.' })
  @ApiResponse({ status: 503, description: 'One or more required dependencies are unavailable.' })
  async readiness() {
    const result =
      await this.healthService.readiness();

    if (result.status !== 'ok') {
      throw new ServiceUnavailableException(result);
    }

    return result;
  }

  @Get()
  @ApiOperation({ summary: 'Compatibility alias for readiness.' })
  async health() {
    return this.readiness();
  }
}
