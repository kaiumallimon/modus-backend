import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ModuleRegistration,
  ModuleRegistrationDocument,
} from './schemas/module-registration.schema';
import { AccessControlService } from '../access-control/access-control.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PermissionDefinition } from '../access-control/constants/permissions.constant';

export interface ModusModuleDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  isCore?: boolean;
  dependencies?: string[];
  permissions?: PermissionDefinition[];
}

@Injectable()
export class ModuleRegistryService {
  private readonly logger = new Logger(ModuleRegistryService.name);

  constructor(
    @InjectModel(ModuleRegistration.name)
    private readonly moduleModel: Model<ModuleRegistrationDocument>,
    private readonly accessControlService: AccessControlService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async registerModule(def: ModusModuleDefinition): Promise<ModuleRegistrationDocument> {
    const moduleId = def.id.toLowerCase().trim();

    // Register permissions with RBAC service
    if (def.permissions && def.permissions.length > 0) {
      this.accessControlService.registerPermissions(def.permissions);
    }

    let existing = await this.moduleModel.findOne({ id: moduleId }).exec();

    if (!existing) {
      existing = await this.moduleModel.create({
        id: moduleId,
        name: def.name,
        description: def.description,
        version: def.version,
        isCore: Boolean(def.isCore),
        isActivated: Boolean(def.isCore), // Core modules activate immediately
        dependencies: def.dependencies || [],
        permissions: def.permissions?.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
        })) || [],
        activatedAt: def.isCore ? new Date() : null,
      });
      this.logger.log(`Registered module: ${def.name} (${moduleId})`);
    } else {
      existing.name = def.name;
      existing.description = def.description;
      existing.version = def.version;
      existing.isCore = Boolean(def.isCore);
      if (def.isCore && !existing.isActivated) {
        existing.isActivated = true;
        existing.activatedAt = new Date();
      }
      existing.dependencies = def.dependencies || [];
      if (def.permissions) {
        existing.permissions = def.permissions.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
        }));
      }
      await existing.save();
    }

    return existing;
  }

  async initializeCoreModules(): Promise<void> {
    const coreModuleDefinitions: ModusModuleDefinition[] = [
      {
        id: 'auth',
        name: 'Authentication Module',
        description: 'Authentication, password security, session and JWT token management',
        version: '1.0.0',
        isCore: true,
        dependencies: ['users'],
      },
      {
        id: 'users',
        name: 'User Management Module',
        description: 'User identities, lifecycle states, and credentials management',
        version: '1.0.0',
        isCore: true,
      },
      {
        id: 'access-control',
        name: 'Access Control (RBAC)',
        description: 'Roles, system permissions, and granular authorization policies',
        version: '1.0.0',
        isCore: true,
        dependencies: ['users'],
      },
      {
        id: 'organization-settings',
        name: 'Organization Profile & Settings',
        description: 'Installation-wide single organization profile, contact, and localization info',
        version: '1.0.0',
        isCore: true,
      },
      {
        id: 'system-settings',
        name: 'System Settings',
        description: 'Global application preferences, formatting rules, and system behavior',
        version: '1.0.0',
        isCore: true,
      },
      {
        id: 'audit-log',
        name: 'Audit Logging',
        description: 'Immutable historical record of security and administrative operations',
        version: '1.0.0',
        isCore: true,
      },
    ];

    for (const mod of coreModuleDefinitions) {
      await this.registerModule(mod);
    }
  }

  async getModules(): Promise<ModuleRegistrationDocument[]> {
    return this.moduleModel.find().sort({ isCore: -1, id: 1 }).exec();
  }

  async getModuleById(id: string): Promise<ModuleRegistrationDocument> {
    const module = await this.moduleModel.findOne({ id: id.toLowerCase().trim() }).exec();
    if (!module) {
      throw new NotFoundException(`Module with identifier "${id}" not found`);
    }
    return module;
  }

  async setModuleActivation(
    id: string,
    isActivated: boolean,
    actor?: { id: string; email: string; humanId?: string; role?: string },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<ModuleRegistrationDocument> {
    const module = await this.getModuleById(id);

    // 1. Prevent deactivating core modules
    if (module.isCore && !isActivated) {
      throw new BadRequestException(
        `Core module "${module.name}" (${module.id}) is fundamental to system integrity and cannot be deactivated.`,
      );
    }

    if (module.isActivated === isActivated) {
      return module; // No change
    }

    // 2. If activating, verify dependencies are satisfied
    if (isActivated && module.dependencies && module.dependencies.length > 0) {
      for (const depId of module.dependencies) {
        const dep = await this.moduleModel.findOne({ id: depId }).exec();
        if (!dep || !dep.isActivated) {
          throw new BadRequestException(
            `Cannot activate module "${module.name}": required dependency "${depId}" is not activated.`,
          );
        }
      }
    }

    // 3. If deactivating, ensure no other active module depends on this one
    if (!isActivated) {
      const activeDependents = await this.moduleModel
        .find({ isActivated: true, dependencies: module.id })
        .exec();

      if (activeDependents.length > 0) {
        const dependentNames = activeDependents.map((d) => d.name).join(', ');
        throw new BadRequestException(
          `Cannot deactivate module "${module.name}": currently activated module(s) [${dependentNames}] depend on it.`,
        );
      }
    }

    module.isActivated = isActivated;
    module.activatedAt = isActivated ? new Date() : null;
    const saved = await module.save();

    if (actor) {
      await this.auditLogService.record({
        actor,
        action: 'MODULE_ACTIVATION_CHANGE',
        resource: 'modules',
        resourceId: module.id,
        description: `Module "${module.name}" was ${isActivated ? 'activated' : 'deactivated'}`,
        metadata: {
          moduleId: module.id,
          isActivated,
        },
        ipAddress,
        userAgent,
      });
    }

    return saved;
  }
}
