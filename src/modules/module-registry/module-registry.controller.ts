import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ModuleRegistryService } from './module-registry.service';
import { SetModuleActivationDto } from './dto/set-module-activation.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { Role } from '../users/enums/role.enum';

@ApiTags('Module Registry')
@ApiBearerAuth()
@Controller('modules')
export class ModuleRegistryController {
  constructor(private readonly moduleService: ModuleRegistryService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('modules.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all registered modules and their installation activation state',
    description:
      'Reports metadata, dependency tree, and activation status for both core system modules and integrated business modules.',
  })
  @ApiResponse({ status: 200, description: 'Modules returned' })
  getModules() {
    return this.moduleService.getModules();
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('modules.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get details of a single module by identifier' })
  @ApiParam({ name: 'id', description: 'Module identifier (e.g. auth, users)' })
  @ApiResponse({ status: 200, description: 'Module returned' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  getModule(@Param('id') id: string) {
    return this.moduleService.getModuleById(id);
  }

  @Patch(':id/activation')
  @Roles(Role.SUPER_ADMIN)
  @RequirePermissions('modules.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate or deactivate a module for the entire installation',
    description:
      'Validates dependencies before activation, prevents deactivation if other active modules depend on it, and strictly protects core modules.',
  })
  @ApiParam({ name: 'id', description: 'Module identifier' })
  @ApiResponse({ status: 200, description: 'Module activation updated' })
  @ApiResponse({ status: 400, description: 'Core module protection or unsatisfied dependencies' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Module not found' })
  setModuleActivation(
    @Param('id') id: string,
    @Body() dto: SetModuleActivationDto,
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

    return this.moduleService.setModuleActivation(
      id,
      dto.isActivated,
      actor,
      ipAddress,
      userAgent,
    );
  }
}
