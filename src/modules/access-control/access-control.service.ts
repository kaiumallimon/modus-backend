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
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  CORE_PERMISSIONS,
  MODULE_NAMES,
  ModulePermissionsGroup,
  PermissionDefinition,
} from './constants/permissions.constant';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from '../users/enums/role.enum';
import { AuditLogService } from '../audit-log/audit-log.service';

export interface RoleWithStats {
  _id: string;
  code: string;
  name: string;
  description: string;
  permissions: string[];
  permissionsCount: number;
  userCount: number;
  isSystem: boolean;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface AccessControlDashboardStats {
  totalRoles: number;
  systemRoles: number;
  customRoles: number;
  activeRoles: number;
  inactiveRoles: number;
  totalPermissions: number;
  roleDistribution: Array<{
    code: string;
    name: string;
    isSystem: boolean;
    isActive: boolean;
    userCount: number;
    permissionsCount: number;
  }>;
}

@Injectable()
export class AccessControlService {
  private readonly logger = new Logger(AccessControlService.name);
  private dynamicPermissions: Map<string, PermissionDefinition> = new Map();

  constructor(
    @InjectModel(RoleEntity.name)
    private readonly roleModel: Model<RoleDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly auditLogService: AuditLogService,
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
    this.logger.log(
      `Registered ${permissions.length} module permissions into AccessControl`,
    );
  }

  getAllPermissions(): PermissionDefinition[] {
    return Array.from(this.dynamicPermissions.values());
  }

  getGroupedPermissions(): ModulePermissionsGroup[] {
    const groupsMap = new Map<string, PermissionDefinition[]>();

    for (const perm of this.dynamicPermissions.values()) {
      const moduleKey = perm.module || 'other';
      if (!groupsMap.has(moduleKey)) {
        groupsMap.set(moduleKey, []);
      }
      groupsMap.get(moduleKey)!.push(perm);
    }

    const result: ModulePermissionsGroup[] = [];
    for (const [moduleKey, perms] of groupsMap.entries()) {
      const meta = MODULE_NAMES[moduleKey] || {
        name: moduleKey.charAt(0).toUpperCase() + moduleKey.slice(1),
        description: `Permissions for ${moduleKey} module`,
      };
      result.push({
        module: moduleKey,
        moduleName: meta.name,
        description: meta.description,
        permissions: perms,
      });
    }

    return result;
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
      const existing = await this.roleModel
        .findOne({ code: roleDef.code })
        .exec();
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

  async findAllRoles(): Promise<RoleWithStats[]> {
    const roles = await this.roleModel
      .find()
      .sort({ isSystem: -1, code: 1 })
      .exec();

    // Attach user count to each role for dashboard visibility
    const rolesWithStats: RoleWithStats[] = await Promise.all(
      roles.map(async (role) => {
        const userCount = await this.userModel.countDocuments({
          role: role.code,
        });
        return {
          _id: role._id.toString(),
          code: role.code,
          name: role.name,
          description: role.description,
          permissions: role.permissions,
          permissionsCount: role.permissions.length,
          userCount,
          isSystem: role.isSystem,
          isActive: role.isActive,
          createdAt: role.createdAt,
          updatedAt: role.updatedAt,
        };
      }),
    );

    return rolesWithStats;
  }

  async getRoleStats(): Promise<AccessControlDashboardStats> {
    const roles = await this.findAllRoles();

    let systemRoles = 0;
    let customRoles = 0;
    let activeRoles = 0;
    let inactiveRoles = 0;

    const roleDistribution = roles.map((r) => {
      if (r.isSystem) systemRoles++;
      else customRoles++;

      if (r.isActive) activeRoles++;
      else inactiveRoles++;

      return {
        code: r.code,
        name: r.name,
        isSystem: r.isSystem,
        isActive: r.isActive,
        userCount: r.userCount,
        permissionsCount: r.permissionsCount,
      };
    });

    return {
      totalRoles: roles.length,
      systemRoles,
      customRoles,
      activeRoles,
      inactiveRoles,
      totalPermissions: this.dynamicPermissions.size,
      roleDistribution,
    };
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

  async findRoleByIdWithUsers(id: string): Promise<{
    role: RoleDocument;
    userCount: number;
    users: Array<{
      id: string;
      humanId?: string;
      email: string;
      firstName: string;
      lastName: string;
      isActive: boolean;
      createdAt?: Date;
    }>;
  }> {
    const role = await this.findRoleById(id);
    const users = await this.userModel
      .find({ role: role.code })
      .select('humanId email firstName lastName isActive createdAt')
      .sort({ createdAt: -1 })
      .exec();

    return {
      role,
      userCount: users.length,
      users: users.map((u) => ({
        id: u._id.toString(),
        humanId: u.humanId,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        isActive: u.isActive,
        createdAt: u.createdAt,
      })),
    };
  }

  async findRoleByCode(code: string): Promise<RoleDocument | null> {
    return this.roleModel.findOne({ code: code.toUpperCase().trim() }).exec();
  }

  async createRole(
    dto: CreateRoleDto,
    actor?: { id: string; email: string; humanId?: string; role?: string },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RoleDocument> {
    const code = dto.code.toUpperCase().trim();
    const existing = await this.findRoleByCode(code);
    if (existing) {
      throw new ConflictException(`Role with code "${code}" already exists`);
    }

    // Validate that all permissions exist in our registry
    if (dto.permissions && dto.permissions.length > 0) {
      for (const permId of dto.permissions) {
        if (!this.dynamicPermissions.has(permId)) {
          throw new BadRequestException(
            `Unrecognized permission identifier "${permId}"`,
          );
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

    const saved = await created.save();

    if (actor) {
      await this.auditLogService.record({
        actor,
        action: 'ROLE_CREATE',
        resource: 'roles',
        resourceId: saved._id.toString(),
        description: `Created custom role "${saved.name}" (${saved.code})`,
        metadata: {
          code: saved.code,
          name: saved.name,
          permissionsCount: saved.permissions.length,
        },
        ipAddress,
        userAgent,
      });
    }

    return saved;
  }

  async updateRole(
    id: string,
    dto: UpdateRoleDto,
    actor?: { id: string; email: string; humanId?: string; role?: string },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<RoleDocument> {
    const role = await this.findRoleById(id);

    if (role.isSystem && role.code === Role.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Super Administrator system role cannot be modified',
      );
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
          throw new BadRequestException(
            `Unrecognized permission identifier "${permId}"`,
          );
        }
      }
      role.permissions = dto.permissions;
    }

    const saved = await role.save();

    if (actor) {
      await this.auditLogService.record({
        actor,
        action: 'ROLE_UPDATE',
        resource: 'roles',
        resourceId: saved._id.toString(),
        description: `Updated role "${saved.name}" (${saved.code})`,
        metadata: { updatedFields: Object.keys(dto) },
        ipAddress,
        userAgent,
      });
    }

    return saved;
  }

  async deleteRole(
    id: string,
    actor?: { id: string; email: string; humanId?: string; role?: string },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; message: string }> {
    const role = await this.findRoleById(id);

    if (role.isSystem) {
      throw new ForbiddenException('System roles cannot be deleted');
    }

    // Protect against deleting roles that are currently assigned to users
    const userCount = await this.userModel.countDocuments({ role: role.code });
    if (userCount > 0) {
      throw new BadRequestException(
        `Cannot delete role "${role.name}" (${role.code}): ${userCount} active user(s) currently have this role assigned. Please reassign them to another role before deleting.`,
      );
    }

    await this.roleModel.findByIdAndDelete(id).exec();

    if (actor) {
      await this.auditLogService.record({
        actor,
        action: 'ROLE_DELETE',
        resource: 'roles',
        resourceId: id,
        description: `Deleted custom role "${role.name}" (${role.code})`,
        metadata: { code: role.code, name: role.name },
        ipAddress,
        userAgent,
      });
    }

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
