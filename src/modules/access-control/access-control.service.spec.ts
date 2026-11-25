import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { RoleEntity } from './schemas/role.schema';
import { User } from '../users/schemas/user.schema';
import { Role } from '../users/enums/role.enum';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('AccessControlService', () => {
  let service: AccessControlService;
  let mockRoleModel: any;
  let mockUserModel: any;
  let mockAuditLogService: any;

  beforeEach(async () => {
    mockRoleModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      _id: '64f1b2c3d4e5f6a7b8c9d0e9',
      save: jest.fn().mockResolvedValue({ _id: '64f1b2c3d4e5f6a7b8c9d0e9', ...dto }),
    }));

    mockRoleModel.find = jest.fn();
    mockRoleModel.findOne = jest.fn();
    mockRoleModel.findById = jest.fn();
    mockRoleModel.create = jest.fn();
    mockRoleModel.findByIdAndDelete = jest.fn();

    mockUserModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(0),
    };

    mockAuditLogService = {
      record: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessControlService,
        {
          provide: getModelToken(RoleEntity.name),
          useValue: mockRoleModel,
        },
        {
          provide: getModelToken(User.name),
          useValue: mockUserModel,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<AccessControlService>(AccessControlService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllPermissions and registerPermissions', () => {
    it('should initially contain core permissions', () => {
      const perms = service.getAllPermissions();
      expect(perms.some((p) => p.id === 'users.read')).toBe(true);
      expect(perms.some((p) => p.id === 'roles.manage')).toBe(true);
    });

    it('should allow registering new module permissions', () => {
      service.registerPermissions([
        {
          id: 'inventory.read',
          name: 'View Inventory',
          description: 'Read stock levels',
          module: 'inventory',
        },
      ]);
      const perms = service.getAllPermissions();
      expect(perms.some((p) => p.id === 'inventory.read')).toBe(true);
    });
  });

  describe('getGroupedPermissions', () => {
    it('should return permissions grouped by module with metadata', () => {
      const groups = service.getGroupedPermissions();
      expect(groups.length).toBeGreaterThan(0);
      const userGroup = groups.find((g) => g.module === 'users');
      expect(userGroup).toBeDefined();
      expect(userGroup?.moduleName).toBe('User Management');
      expect(userGroup?.permissions.some((p) => p.id === 'users.read')).toBe(true);
    });
  });

  describe('initializeDefaultRolesAndPermissions', () => {
    it('should create default roles if they do not exist', async () => {
      mockRoleModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await service.initializeDefaultRolesAndPermissions();

      expect(mockRoleModel.create).toHaveBeenCalledTimes(4); // SUPER_ADMIN, ADMIN, MANAGER, EMPLOYEE
    });
  });

  describe('findAllRoles and getRoleStats', () => {
    it('should return roles with user counts', async () => {
      const mockRoles = [
        {
          _id: { toString: () => 'id-1' },
          code: Role.SUPER_ADMIN,
          name: 'Super Admin',
          description: 'Owner',
          permissions: ['users.read'],
          isSystem: true,
          isActive: true,
        },
      ];
      mockRoleModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockRoles),
        }),
      });
      mockUserModel.countDocuments.mockResolvedValue(1);

      const roles = await service.findAllRoles();
      expect(roles).toHaveLength(1);
      expect(roles[0]).toHaveProperty('userCount', 1);
      expect(roles[0]).toHaveProperty('permissionsCount', 1);
    });

    it('should calculate role stats correctly for dashboard', async () => {
      const mockRoles = [
        {
          _id: { toString: () => 'id-1' },
          code: Role.SUPER_ADMIN,
          name: 'Super Admin',
          description: 'Owner',
          permissions: ['users.read'],
          isSystem: true,
          isActive: true,
        },
        {
          _id: { toString: () => 'id-2' },
          code: 'CUSTOM_AUDITOR',
          name: 'Auditor',
          description: 'Custom',
          permissions: ['audit.read'],
          isSystem: false,
          isActive: true,
        },
      ];
      mockRoleModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(mockRoles),
        }),
      });
      mockUserModel.countDocuments.mockResolvedValue(2);

      const stats = await service.getRoleStats();
      expect(stats.totalRoles).toBe(2);
      expect(stats.systemRoles).toBe(1);
      expect(stats.customRoles).toBe(1);
      expect(stats.activeRoles).toBe(2);
      expect(stats.totalPermissions).toBeGreaterThan(0);
      expect(stats.roleDistribution).toHaveLength(2);
    });
  });

  describe('findRoleByIdWithUsers', () => {
    it('should return role details and list of assigned users', async () => {
      const mockRole = {
        _id: '64f1b2c3d4e5f6a7b8c9d0e1',
        code: 'MANAGER',
        name: 'Manager',
        permissions: ['users.read'],
      };
      mockRoleModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRole),
      });

      const mockUsers = [
        {
          _id: { toString: () => 'user-1' },
          humanId: 'MOD-10001',
          email: 'manager@modus.local',
          firstName: 'John',
          lastName: 'Doe',
          isActive: true,
          createdAt: new Date(),
        },
      ];
      mockUserModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue(mockUsers),
          }),
        }),
      });

      const result = await service.findRoleByIdWithUsers('64f1b2c3d4e5f6a7b8c9d0e1');
      expect(result.role).toEqual(mockRole);
      expect(result.userCount).toBe(1);
      expect(result.users[0].email).toBe('manager@modus.local');
    });
  });

  describe('createRole', () => {
    it('should create a custom role with valid permissions', async () => {
      mockRoleModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const role = await service.createRole({
        code: 'CUSTOM_AUDITOR',
        name: 'Auditor',
        permissions: ['audit.read', 'users.read'],
      });

      expect(role).toBeDefined();
    });

    it('should throw ConflictException if role code already exists', async () => {
      mockRoleModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ code: 'CUSTOM_AUDITOR' }),
      });

      await expect(
        service.createRole({
          code: 'CUSTOM_AUDITOR',
          name: 'Auditor',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if unknown permission is specified', async () => {
      mockRoleModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.createRole({
          code: 'CUSTOM_ROLE',
          name: 'Custom',
          permissions: ['nonexistent.permission'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateRole', () => {
    it('should throw ForbiddenException when attempting to modify SUPER_ADMIN', async () => {
      const mockAdminRole = {
        _id: '64f1b2c3d4e5f6a7b8c9d0e1',
        code: Role.SUPER_ADMIN,
        isSystem: true,
      };

      mockRoleModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockAdminRole),
      });

      await expect(
        service.updateRole('64f1b2c3d4e5f6a7b8c9d0e1', { name: 'Renamed' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteRole', () => {
    it('should throw ForbiddenException when attempting to delete a system role', async () => {
      const mockSystemRole = {
        _id: '64f1b2c3d4e5f6a7b8c9d0e2',
        code: Role.ADMIN,
        isSystem: true,
      };

      mockRoleModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockSystemRole),
      });

      await expect(
        service.deleteRole('64f1b2c3d4e5f6a7b8c9d0e2'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when attempting to delete a role assigned to users', async () => {
      const mockCustomRole = {
        _id: '64f1b2c3d4e5f6a7b8c9d0e3',
        code: 'CUSTOM_ROLE',
        name: 'Custom Role',
        isSystem: false,
      };

      mockRoleModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockCustomRole),
      });
      mockUserModel.countDocuments.mockResolvedValue(3);

      await expect(
        service.deleteRole('64f1b2c3d4e5f6a7b8c9d0e3'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('hasPermission', () => {
    it('should return true immediately for SUPER_ADMIN role', async () => {
      const result = await service.hasPermission(Role.SUPER_ADMIN, 'any.perm');
      expect(result).toBe(true);
    });

    it('should check permissions array for standard roles', async () => {
      mockRoleModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          code: Role.ADMIN,
          isActive: true,
          permissions: ['users.read', 'settings.read'],
        }),
      });

      const canReadUsers = await service.hasPermission(Role.ADMIN, 'users.read');
      const canDeleteUsers = await service.hasPermission(Role.ADMIN, 'users.delete');

      expect(canReadUsers).toBe(true);
      expect(canDeleteUsers).toBe(false);
    });
  });
});
