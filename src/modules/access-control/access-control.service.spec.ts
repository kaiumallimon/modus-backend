import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { RoleEntity } from './schemas/role.schema';
import { Role } from '../users/enums/role.enum';

describe('AccessControlService', () => {
  let service: AccessControlService;
  let mockRoleModel: any;

  beforeEach(async () => {
    mockRoleModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue(dto),
    }));

    mockRoleModel.find = jest.fn();
    mockRoleModel.findOne = jest.fn();
    mockRoleModel.findById = jest.fn();
    mockRoleModel.create = jest.fn();
    mockRoleModel.findByIdAndDelete = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessControlService,
        {
          provide: getModelToken(RoleEntity.name),
          useValue: mockRoleModel,
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

  describe('initializeDefaultRolesAndPermissions', () => {
    it('should create default roles if they do not exist', async () => {
      mockRoleModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await service.initializeDefaultRolesAndPermissions();

      expect(mockRoleModel.create).toHaveBeenCalledTimes(4); // SUPER_ADMIN, ADMIN, MANAGER, EMPLOYEE
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
          permissions: ['users.read', 'organization.read'],
        }),
      });

      const canReadUsers = await service.hasPermission(Role.ADMIN, 'users.read');
      const canDeleteUsers = await service.hasPermission(Role.ADMIN, 'users.delete');

      expect(canReadUsers).toBe(true);
      expect(canDeleteUsers).toBe(false);
    });
  });
});
