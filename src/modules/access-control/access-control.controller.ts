import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AccessControlService } from './access-control.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../users/enums/role.enum';

@ApiTags('Access Control')
@ApiBearerAuth()
@Controller()
export class AccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  @Get('permissions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('roles.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all registered system and module permissions',
    description:
      'Returns the master permission registry including core permissions and dynamically registered module permissions.',
  })
  @ApiResponse({ status: 200, description: 'Permissions list returned' })
  getPermissions() {
    return this.accessControlService.getAllPermissions();
  }

  @Get('roles')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('roles.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all roles with their assigned permissions' })
  @ApiResponse({ status: 200, description: 'Roles list returned' })
  getRoles() {
    return this.accessControlService.findAllRoles();
  }

  @Get('roles/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('roles.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get single role by ID' })
  @ApiParam({ name: 'id', description: 'Role MongoDB ID' })
  @ApiResponse({ status: 200, description: 'Role returned' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  getRole(@Param('id') id: string) {
    return this.accessControlService.findRoleById(id);
  }

  @Post('roles')
  @Roles(Role.SUPER_ADMIN)
  @RequirePermissions('roles.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create custom role (strictly Super Admin)' })
  @ApiResponse({ status: 201, description: 'Role created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid payload or unknown permissions' })
  @ApiResponse({ status: 409, description: 'Role code already exists' })
  createRole(@Body() dto: CreateRoleDto) {
    return this.accessControlService.createRole(dto);
  }

  @Patch('roles/:id')
  @Roles(Role.SUPER_ADMIN)
  @RequirePermissions('roles.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update role details and permissions' })
  @ApiParam({ name: 'id', description: 'Role MongoDB ID' })
  @ApiResponse({ status: 200, description: 'Role updated successfully' })
  @ApiResponse({ status: 403, description: 'Cannot modify Super Admin system role' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.accessControlService.updateRole(id, dto);
  }

  @Delete('roles/:id')
  @Roles(Role.SUPER_ADMIN)
  @RequirePermissions('roles.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete custom role (system roles cannot be deleted)' })
  @ApiParam({ name: 'id', description: 'Role MongoDB ID' })
  @ApiResponse({ status: 200, description: 'Role deleted successfully' })
  @ApiResponse({ status: 403, description: 'Cannot delete system roles' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  deleteRole(@Param('id') id: string) {
    return this.accessControlService.deleteRole(id);
  }
}
