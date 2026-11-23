import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InstallationService } from './installation.service';
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
        isInitialized: { type: 'boolean', example: false },
        initializedAt: { type: 'string', format: 'date-time', nullable: true },
        version: { type: 'string', example: '1.0.0' },
      },
    },
  })
  async getStatus() {
    const state = await this.installationService.getOrCreateInstallationState();
    return {
      isInitialized: state.isInitialized,
      initializedAt: state.initializedAt,
      version: state.version,
    };
  }
}
