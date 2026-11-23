import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
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
import { UsersService } from './users.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../common/decorators/current-user.decorator';
import { Role } from './enums/role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { AssignRoleDto } from './dto/assign-role.dto';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('users.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new user with generated credentials and assigned role',
    description:
      'Validates email domain deliverability, generates an 8-10 character human-readable strong temporary password, hashes it with Argon2, creates the user, and emails credentials securely via SMTP.',
  })
  @ApiResponse({ status: 201, description: 'User created successfully and credentials emailed' })
  @ApiResponse({ status: 400, description: 'Validation failed or email domain does not receive emails' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (insufficient permissions)',
  })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.usersService.createUser(dto, currentUser.role as Role);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('users.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get paginated list of users with optional filtering and search',
  })
  @ApiResponse({ status: 200, description: 'Paginated user list returned' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findAll(@Query() query: QueryUserDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('users.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get single user by ID' })
  @ApiParam({ name: 'id', description: 'User MongoDB ID' })
  @ApiResponse({ status: 200, description: 'User details returned' })
  @ApiResponse({ status: 400, description: 'Invalid user ID format' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Get(':id/permissions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('roles.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get effective permissions of a user',
    description:
      'Returns the effective permissions for a user based on their assigned role, including whether they are a Super Administrator with full access.',
  })
  @ApiParam({ name: 'id', description: 'User MongoDB ID' })
  @ApiResponse({ status: 200, description: 'Effective user permissions returned' })
  @ApiResponse({ status: 400, description: 'Invalid user ID format' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getUserPermissions(@Param('id') id: string) {
    return this.usersService.getUserPermissions(id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('users.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update user profile details (strictly SUPER_ADMIN for roles)',
  })
  @ApiParam({ name: 'id', description: 'User MongoDB ID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid payload or ID format' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden (modifying role without SUPER_ADMIN)',
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.usersService.update(
      id,
      dto,
      currentUser.userId,
      currentUser.role as Role,
    );
  }

  @Patch(':id/role')
  @Roles(Role.SUPER_ADMIN)
  @RequirePermissions('roles.manage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Assign role to user (Super Administrator only)',
    description:
      'Assigns a system or custom role to the user. Validates that the role exists and is active, and prevents demoting the last active Super Administrator.',
  })
  @ApiParam({ name: 'id', description: 'User MongoDB ID' })
  @ApiResponse({ status: 200, description: 'Role assigned successfully' })
  @ApiResponse({ status: 400, description: 'Invalid user ID or inactive/unknown role' })
  @ApiResponse({ status: 403, description: 'Forbidden (cannot demote the last active Super Administrator)' })
  @ApiResponse({ status: 404, description: 'User not found' })
  assignRole(
    @Param('id') id: string,
    @Body() dto: AssignRoleDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.usersService.assignRole(
      id,
      dto.role,
      currentUser.userId,
      currentUser.role,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Patch(':id/status')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @RequirePermissions('users.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Toggle user active/inactive status (cannot deactivate self)',
  })
  @ApiParam({ name: 'id', description: 'User MongoDB ID' })
  @ApiResponse({ status: 200, description: 'User status updated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot deactivate own account' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser() currentUser: CurrentUserPayload,
  ) {
    return this.usersService.updateStatus(
      id,
      dto,
      currentUser.userId,
      currentUser.role as Role,
    );
  }
}
