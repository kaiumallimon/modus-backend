import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { ModuleRegistryService } from './module-registry.service';
import { ModuleRegistration } from './schemas/module-registration.schema';
import { AccessControlService } from '../access-control/access-control.service';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('ModuleRegistryService', () => {
  let service: ModuleRegistryService;
  let mockModuleModel: any;
  let mockAccessControlService: { registerPermissions: jest.Mock };
  let mockAuditLogService: { record: jest.Mock };

  beforeEach(async () => {
    mockModuleModel = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
    };

    mockAccessControlService = {
      registerPermissions: jest.fn(),
    };

    mockAuditLogService = {
      record: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModuleRegistryService,
        {
          provide: getModelToken(ModuleRegistration.name),
          useValue: mockModuleModel,
        },
        {
          provide: AccessControlService,
          useValue: mockAccessControlService,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<ModuleRegistryService>(ModuleRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('setModuleActivation', () => {
    it('should throw BadRequestException when attempting to deactivate a core module', async () => {
      mockModuleModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          id: 'auth',
          name: 'Authentication Module',
          isCore: true,
          isActivated: true,
        }),
      });

      await expect(
        service.setModuleActivation('auth', false),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if activating a module whose dependencies are not active', async () => {
      mockModuleModel.findOne
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue({
            id: 'analytics',
            name: 'Analytics Module',
            isCore: false,
            isActivated: false,
            dependencies: ['sales'],
          }),
        })
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue({
            id: 'sales',
            isActivated: false, // Dependency is not active!
          }),
        });

      await expect(
        service.setModuleActivation('analytics', true),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when deactivating a module that other active modules depend upon', async () => {
      mockModuleModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          id: 'inventory',
          name: 'Inventory Module',
          isCore: false,
          isActivated: true,
        }),
      });

      mockModuleModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { name: 'Manufacturing Module', id: 'manufacturing', isActivated: true },
        ]),
      });

      await expect(
        service.setModuleActivation('inventory', false),
      ).rejects.toThrow(BadRequestException);
    });

    it('should activate a standalone module when dependencies are satisfied', async () => {
      const mockDoc: any = {
        id: 'crm',
        name: 'CRM Module',
        isCore: false,
        isActivated: false,
        dependencies: [],
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };

      mockModuleModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoc),
      });

      const updated = await service.setModuleActivation(
        'crm',
        true,
        { id: 'admin1', email: 'admin@modus.local' },
      );

      expect(updated.isActivated).toBe(true);
      expect(mockAuditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'MODULE_ACTIVATION_CHANGE',
          resource: 'modules',
        }),
      );
    });
  });
});
