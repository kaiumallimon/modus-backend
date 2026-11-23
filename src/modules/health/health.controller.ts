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
    summary: 'Process health check',
    description: 'Verifies that the Modus application process is running.',
  })
  @ApiResponse({ status: 200, description: 'Application process is alive' })
  check() {
    return {
      status: 'ok',
      application: this.configService.get<string>('app.name', 'Modus'),
    };
  }

  @Public()
  @Get('ready')
  @ApiOperation({
    summary: 'Readiness check',
    description:
      'Verifies that the application and its dependencies (MongoDB) are ready to serve requests.',
  })
  @ApiResponse({
    status: 200,
    description: 'Application is ready and database is connected',
  })
  @ApiResponse({
    status: 503,
    description: 'Application is not ready (database disconnected)',
  })
  ready() {
    const isDatabaseConnected = this.connection.readyState === 1;

    const response = {
      status: isDatabaseConnected ? 'ok' : 'degraded',
      statusCode: isDatabaseConnected
        ? HttpStatus.OK
        : HttpStatus.SERVICE_UNAVAILABLE,
      application: this.configService.get<string>('app.name', 'Modus'),
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
