import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RoleEntity, RoleDocument } from './schemas/role.schema';
import {
  CORE_PERMISSIONS,
  PermissionDefinition,
} from './constants/permissions.constant';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from '../users/enums/role.enum';

@Injectable()
export class AccessControlService {
  private readonly logger = new Logger(AccessControlService.name);
  private dynamicPermissions: Map<string, PermissionDefinition> = new Map();

  constructor(
    @InjectModel(RoleEntity.name)
    private readonly roleModel: Model<RoleDocument>,
  ) {
    // Populate map with core permissions
    for (const perm of CORE_PERMISSIONS) {
      this.dynamicPermissions.set(perm.id, perm);
    }
  }

  registerPermissions(permissions: PermissionDefinition[]): void {
    for (const perm of permissions) {
      this.dynamicPermissions.set(perm.id, perm);
    }
    this.logger.log(`Registered ${permissions.length} module permissions into AccessControl`);
  }

  getAllPermissions(): PermissionDefinition[] {
    return Array.from(this.dynamicPermissions.values());
  }

  async initializeDefaultRolesAndPermissions(): Promise<void> {
    const allCorePermIds = CORE_PERMISSIONS.map((p) => p.id);

    const defaultRoles: Array<{
      code: string;
      name: string;
      description: string;
      isSystem: boolean;
      permissions: string[];
    }> = [
      {
        code: Role.SUPER_ADMIN,
        name: 'Super Administrator',
        description: 'Full unrestricted installation-level administration',
        isSystem: true,
        permissions: allCorePermIds,
      },
      {
        code: Role.ADMIN,
        name: 'Administrator',
        description: 'General system administration and operational management',
        isSystem: true,
        permissions: [
          'users.read',
          'users.create',
          'users.update',
          'roles.read',
          'settings.read',
          'organization.read',
          'organization.update',
          'modules.read',
          'audit.read',
        ],
      },
      {
        code: Role.MANAGER,
        name: 'Manager',
        description: 'Operational manager with view and update capabilities',
        isSystem: true,
        permissions: [
          'users.read',
          'organization.read',
          'modules.read',
          'audit.read',
        ],
      },
      {
        code: Role.EMPLOYEE,
        name: 'Employee',
        description: 'Standard staff member with limited permissions',
        isSystem: true,
        permissions: ['organization.read'],
      },
    ];

    for (const roleDef of defaultRoles) {
      const existing = await this.roleModel.findOne({ code: roleDef.code }).exec();
      if (!existing) {
        await this.roleModel.create({
          code: roleDef.code,
          name: roleDef.name,
          description: roleDef.description,
          isSystem: roleDef.isSystem,
          isActive: true,
          permissions: roleDef.permissions,
        });
        this.logger.log(`Initialized default system role: ${roleDef.code}`);
      }
    }
  }

  async findAllRoles(): Promise<RoleDocument[]> {
    return this.roleModel.find().sort({ isSystem: -1, code: 1 }).exec();
  }

  async findRoleById(id: string): Promise<RoleDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid role ID format');
    }
    const role = await this.roleModel.findById(id).exec();
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  async findRoleByCode(code: string): Promise<RoleDocument | null> {
    return this.roleModel.findOne({ code: code.toUpperCase().trim() }).exec();
  }

  async createRole(dto: CreateRoleDto): Promise<RoleDocument> {
    const code = dto.code.toUpperCase().trim();
    const existing = await this.findRoleByCode(code);
    if (existing) {
      throw new ConflictException(`Role with code "${code}" already exists`);
    }

    // Validate that all permissions exist in our registry
    if (dto.permissions && dto.permissions.length > 0) {
      for (const permId of dto.permissions) {
        if (!this.dynamicPermissions.has(permId)) {
          throw new BadRequestException(`Unrecognized permission identifier "${permId}"`);
        }
      }
    }

    const created = new this.roleModel({
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() || '',
      permissions: dto.permissions || [],
      isSystem: false,
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    return created.save();
  }

  async updateRole(id: string, dto: UpdateRoleDto): Promise<RoleDocument> {
    const role = await this.findRoleById(id);

    if (role.isSystem && role.code === Role.SUPER_ADMIN) {
      throw new ForbiddenException('Super Administrator role cannot be modified');
    }

    if (dto.name !== undefined) {
      role.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      role.description = dto.description.trim();
    }
    if (dto.isActive !== undefined) {
      if (role.isSystem && !dto.isActive) {
        throw new ForbiddenException('System roles cannot be deactivated');
      }
      role.isActive = dto.isActive;
    }
    if (dto.permissions !== undefined) {
      for (const permId of dto.permissions) {
        if (!this.dynamicPermissions.has(permId)) {
          throw new BadRequestException(`Unrecognized permission identifier "${permId}"`);
        }
      }
      role.permissions = dto.permissions;
    }

    return role.save();
  }

  async deleteRole(id: string): Promise<{ success: boolean; message: string }> {
    const role = await this.findRoleById(id);

    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be deleted');
    }

    await this.roleModel.findByIdAndDelete(id).exec();
    return {
      success: true,
      message: `Role "${role.name}" (${role.code}) deleted successfully`,
    };
  }

  async hasPermission(roleCode: string, permission: string): Promise<boolean> {
    if (roleCode === Role.SUPER_ADMIN) {
      return true;
    }

    const role = await this.findRoleByCode(roleCode);
    if (!role || !role.isActive) {
      return false;
    }

    return role.permissions.includes(permission);
  }
}
