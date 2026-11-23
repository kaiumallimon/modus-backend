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
import { AccessControlService } from './access-control.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
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
      'Returns the flat master permission registry including core permissions and dynamically registered module permissions.',
  })
  @ApiResponse({ status: 200, description: 'Permissions list returned' })
  getPermissions() {
    return this.accessControlService.getAllPermissions();
  }

  @Get('permissions/grouped')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('roles.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List permissions grouped by module for matrix/checklist UI',
    description:
      'Returns all registered permissions organized by module category with human-readable titles and descriptions for easy rendering in dashboard management forms.',
  })
  @ApiResponse({ status: 200, description: 'Grouped permissions returned' })
  getGroupedPermissions() {
    return this.accessControlService.getGroupedPermissions();
  }

  @Get('roles')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('roles.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List all roles with user counts and permissions',
    description:
      'Returns all system and custom roles along with permissions count and assigned active user counts.',
  })
  @ApiResponse({ status: 200, description: 'Roles list returned' })
  getRoles() {
    return this.accessControlService.findAllRoles();
  }

  @Get('roles/stats')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('roles.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get RBAC summary metrics for Superadmin dashboard',
    description:
      'Returns overall counts for roles, system vs custom roles, active/inactive roles, total registered permissions, and distribution of users across roles.',
  })
  @ApiResponse({ status: 200, description: 'Dashboard stats returned' })
  getRoleStats() {
    return this.accessControlService.getRoleStats();
  }

  @Get('roles/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('roles.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get single role by ID with list of assigned users',
    description:
      'Returns detailed role information along with the list of users currently assigned to this role.',
  })
  @ApiParam({ name: 'id', description: 'Role MongoDB ID' })
  @ApiResponse({ status: 200, description: 'Role and assigned users returned' })
  @ApiResponse({ status: 400, description: 'Invalid role ID format' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  getRole(@Param('id') id: string) {
    return this.accessControlService.findRoleByIdWithUsers(id);
  }

  @Post('roles')
  @Roles(Role.SUPER_ADMIN)
  @RequirePermissions('roles.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create custom role (strictly Super Admin)' })
  @ApiResponse({ status: 201, description: 'Role created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid payload or unknown permissions' })
  @ApiResponse({ status: 409, description: 'Role code already exists' })
  createRole(
    @Body() dto: CreateRoleDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.accessControlService.createRole(
      dto,
      {
        id: currentUser.userId,
        email: currentUser.email,
        role: currentUser.role,
      },
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Patch('roles/:id')
  @Roles(Role.SUPER_ADMIN)
  @RequirePermissions('roles.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update role details and permissions' })
  @ApiParam({ name: 'id', description: 'Role MongoDB ID' })
  @ApiResponse({ status: 200, description: 'Role updated successfully' })
  @ApiResponse({ status: 403, description: 'Cannot modify Super Admin system role or deactivate system roles' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.accessControlService.updateRole(
      id,
      dto,
      {
        id: currentUser.userId,
        email: currentUser.email,
        role: currentUser.role,
      },
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Delete('roles/:id')
  @Roles(Role.SUPER_ADMIN)
  @RequirePermissions('roles.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete custom role (system roles and roles with assigned users cannot be deleted)' })
  @ApiParam({ name: 'id', description: 'Role MongoDB ID' })
  @ApiResponse({ status: 200, description: 'Role deleted successfully' })
  @ApiResponse({ status: 400, description: 'Role is currently assigned to users' })
  @ApiResponse({ status: 403, description: 'Cannot delete system roles' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  deleteRole(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.accessControlService.deleteRole(
      id,
      {
        id: currentUser.userId,
        email: currentUser.email,
        role: currentUser.role,
      },
      req.ip,
      req.headers['user-agent'],
    );
  }
}
