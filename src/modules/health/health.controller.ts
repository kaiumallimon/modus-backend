import {
  Controller,
  Get,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Connection } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../common/decorators/public.decorator';

@Controller('health')
@ApiTags('Health')
export class HealthController {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Check API and database health',
  })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @ApiResponse({
    status: 503,
    description: 'Service is degraded (database unavailable)',
  })
  check() {
    const isDatabaseConnected = this.connection.readyState === 1;
    const response = {
      status: isDatabaseConnected ? 'ok' : 'degraded',
      statusCode: isDatabaseConnected
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE,
      service: this.configService.get<string>('app.name', 'Pharmbrew'),
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      dependencies: {
        database: {
          status: isDatabaseConnected ? 'connected' : 'disconnected',
        },
      },
    };

    if (!isDatabaseConnected) {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }
}
