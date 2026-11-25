import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { InstallationService } from './installation.service';
import { InstallationSetupDto } from './dto/installation-setup.dto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Installation')
@Controller('installation')
export class InstallationController {
  constructor(private readonly installationService: InstallationService) {}

  @Public()
  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check installation readiness and initialization status',
    description:
      'Reports whether the self-hosted Modus installation has completed its initial administrator and system setup.',
  })
  @ApiResponse({
    status: 200,
    description: 'Installation status returned',
    schema: {
      type: 'object',
      properties: {
        initialized: { type: 'boolean', example: false },
        setupRequired: { type: 'boolean', example: true },
        isInitialized: { type: 'boolean', example: false },
        initializedAt: { type: 'string', format: 'date-time', nullable: true },
        version: { type: 'string', example: '1.0.0' },
      },
    },
  })
  async getStatus() {
    const state = await this.installationService.getOrCreateInstallationState();
    return {
      initialized: state.isInitialized,
      setupRequired: !state.isInitialized,
      isInitialized: state.isInitialized,
      initializedAt: state.initializedAt,
      version: state.version,
    };
  }

  @Public()
  @Post('setup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initial installation bootstrap and first administrator creation',
    description:
      'Atomically creates the first Super Administrator, initializes system settings, default roles and permissions, registers core modules, and seals the installation.',
  })
  @ApiResponse({ status: 201, description: 'Installation successfully initialized' })
  @ApiResponse({
    status: 403,
    description: 'Installation already initialized (repeated setup prohibited)',
  })
  @ApiResponse({ status: 409, description: 'Administrator email already exists' })
  async setup(@Body() dto: InstallationSetupDto, @Req() req?: Request) {
    const ipAddress = req?.ip || req?.socket?.remoteAddress;
    const userAgent = req?.headers ? req.headers['user-agent'] : undefined;
    return this.installationService.setupInstallation(
      dto,
      ipAddress,
      userAgent,
    );
  }
}
