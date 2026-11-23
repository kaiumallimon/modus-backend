import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { SystemSettingsService } from './system-settings.service';
import { UpdateSystemSettingsDto } from './dto/update-system-settings.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Role } from '../users/enums/role.enum';

@ApiTags('System Settings')
@ApiBearerAuth()
@Controller('settings')
export class SystemSettingsController {
  constructor(private readonly settingsService: SystemSettingsService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('settings.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get application-level system preferences',
    description: 'Retrieves global system settings, pagination defaults, and custom application preferences.',
  })
  @ApiResponse({ status: 200, description: 'System settings returned' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch()
  @Roles(Role.SUPER_ADMIN)
  @RequirePermissions('settings.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update application-level system preferences (strictly Super Admin)',
  })
  @ApiResponse({ status: 200, description: 'System settings updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed or secrets detected' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  updateSettings(
    @Body() dto: UpdateSystemSettingsDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    const actor = {
      id: currentUser.userId,
      email: currentUser.email,
      role: currentUser.role,
    };
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.settingsService.updateSettings(dto, actor, ipAddress, userAgent);
  }
}
