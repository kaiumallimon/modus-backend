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
import { OrganizationService } from './organization.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Role } from '../users/enums/role.enum';

@ApiTags('Organization Settings')
@ApiBearerAuth()
@Controller('organization')
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.EMPLOYEE)
  @RequirePermissions('organization.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get organization profile and settings',
    description: 'Retrieves the single-organization profile and localization settings.',
  })
  @ApiResponse({ status: 200, description: 'Organization profile returned' })
  getOrganization() {
    return this.orgService.getSettings();
  }

  @Patch()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('organization.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update organization profile and settings',
    description: 'Updates organization contact details, address, currency, timezone, and locale.',
  })
  @ApiResponse({ status: 200, description: 'Organization updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  updateOrganization(
    @Body() dto: UpdateOrganizationDto,
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

    return this.orgService.updateSettings(dto, actor, ipAddress, userAgent);
  }
}
