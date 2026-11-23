import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { InstallationService } from './installation.service';
import {
  Installation,
  SINGLETON_INSTALLATION_KEY,
} from './schemas/installation.schema';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';
import { AccessControlService } from '../access-control/access-control.service';
import { OrganizationService } from '../organization/organization.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { ModuleRegistryService } from '../module-registry/module-registry.service';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('InstallationService', () => {
  let service: InstallationService;
  let mockInstallationModel: any;
  let mockUsersService: any;
  let mockAuthService: any;
  let mockAccessControlService: any;
  let mockOrganizationService: any;
  let mockSystemSettingsService: any;
  let mockModuleRegistryService: any;
  let mockAuditLogService: any;

  beforeEach(async () => {
    mockInstallationModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };

    mockUsersService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
      generateUniqueHumanId: jest.fn().mockResolvedValue('MOD-10001'),
      updateHashedRefreshToken: jest.fn(),
    };

    mockAuthService = {
      hashData: jest.fn().mockResolvedValue('hashed_password'),
      generateTokens: jest.fn().mockResolvedValue({
        accessToken: 'access_tok',
        refreshToken: 'refresh_tok',
      }),
    };

    mockAccessControlService = {
      initializeDefaultRolesAndPermissions: jest.fn().mockResolvedValue(undefined),
    };

    mockOrganizationService = {
      getOrCreateSettings: jest.fn().mockResolvedValue({
        name: 'Modus Test Org',
        email: 'contact@modus.local',
        currency: 'USD',
      }),
    };

    mockSystemSettingsService = {
      getOrCreateSettings: jest.fn().mockResolvedValue({}),
    };

    mockModuleRegistryService = {
      initializeCoreModules: jest.fn().mockResolvedValue(undefined),
    };

    mockAuditLogService = {
      record: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstallationService,
        {
          provide: getModelToken(Installation.name),
          useValue: mockInstallationModel,
        },
        { provide: UsersService, useValue: mockUsersService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: AccessControlService, useValue: mockAccessControlService },
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: SystemSettingsService, useValue: mockSystemSettingsService },
        { provide: ModuleRegistryService, useValue: mockModuleRegistryService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<InstallationService>(InstallationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrCreateInstallationState', () => {
    it('should return existing installation state if record already exists', async () => {
      const existingDoc = {
        key: SINGLETON_INSTALLATION_KEY,
        isInitialized: true,
        initializedAt: new Date(),
        version: '1.0.0',
      };

      mockInstallationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(existingDoc),
      });

      const result = await service.getOrCreateInstallationState();

      expect(mockInstallationModel.findOne).toHaveBeenCalledWith({
        key: SINGLETON_INSTALLATION_KEY,
      });
      expect(result).toBe(existingDoc);
      expect(mockInstallationModel.create).not.toHaveBeenCalled();
    });

    it('should create singleton record if no record exists', async () => {
      const createdDoc = {
        key: SINGLETON_INSTALLATION_KEY,
        isInitialized: false,
        initializedAt: null,
        version: '1.0.0',
      };

      mockInstallationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      mockInstallationModel.create.mockResolvedValue(createdDoc);

      const result = await service.getOrCreateInstallationState();

      expect(mockInstallationModel.create).toHaveBeenCalledWith({
        key: SINGLETON_INSTALLATION_KEY,
        isInitialized: false,
        initializedAt: null,
        version: '1.0.0',
      });
      expect(result).toBe(createdDoc);
    });

    it('should handle race condition (duplicate key code 11000) by querying existing document', async () => {
      const racedDoc = {
        key: SINGLETON_INSTALLATION_KEY,
        isInitialized: false,
        initializedAt: null,
        version: '1.0.0',
      };

      mockInstallationModel.findOne
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(racedDoc) });

      const duplicateError: any = new Error('E11000 duplicate key');
      duplicateError.code = 11000;
      mockInstallationModel.create.mockRejectedValue(duplicateError);

      const result = await service.getOrCreateInstallationState();

      expect(result).toBe(racedDoc);
    });
  });

  describe('isInitialized', () => {
    it('should return false when installation has not been initialized', async () => {
      mockInstallationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ isInitialized: false }),
      });

      const initialized = await service.isInitialized();
      expect(initialized).toBe(false);
    });

    it('should return true when installation has been marked as initialized', async () => {
      mockInstallationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ isInitialized: true }),
      });

      const initialized = await service.isInitialized();
      expect(initialized).toBe(true);
    });
  });

  describe('markAsInitialized', () => {
    it('should update state to isInitialized=true and save document', async () => {
      const mockDoc: any = {
        key: SINGLETON_INSTALLATION_KEY,
        isInitialized: false,
        initializedAt: null,
        version: '1.0.0',
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };

      mockInstallationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoc),
      });

      const updated = await service.markAsInitialized('1.2.0');

      expect(updated.isInitialized).toBe(true);
      expect(updated.initializedAt).toBeInstanceOf(Date);
      expect(updated.version).toBe('1.2.0');
      expect(mockDoc.save).toHaveBeenCalled();
    });
  });

  describe('setupInstallation', () => {
    it('should throw ForbiddenException if installation is already initialized', async () => {
      mockInstallationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ isInitialized: true }),
      });

      await expect(
        service.setupInstallation({
          administrator: {
            firstName: 'Super',
            lastName: 'Admin',
            email: 'admin@modus.local',
            password: 'Password123!',
          },
          organization: {
            name: 'Modus Corp',
            email: 'contact@modus.local',
          },
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if administrator email already exists', async () => {
      mockInstallationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ isInitialized: false }),
      });
      mockUsersService.findByEmail.mockResolvedValue({ email: 'admin@modus.local' });

      await expect(
        service.setupInstallation({
          administrator: {
            firstName: 'Super',
            lastName: 'Admin',
            email: 'admin@modus.local',
            password: 'Password123!',
          },
          organization: {
            name: 'Modus Corp',
            email: 'contact@modus.local',
          },
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully bootstrap installation on valid request', async () => {
      const mockStateDoc: any = {
        _id: 'install123',
        key: SINGLETON_INSTALLATION_KEY,
        isInitialized: false,
        initializedAt: null,
        version: '1.0.0',
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };

      mockInstallationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockStateDoc),
      });
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        _id: 'user123',
        humanId: 'MOD-10001',
        email: 'admin@modus.local',
        firstName: 'Super',
        lastName: 'Admin',
        role: 'SUPER_ADMIN',
      });

      const result = await service.setupInstallation({
        administrator: {
          firstName: 'Super',
          lastName: 'Admin',
          email: 'admin@modus.local',
          password: 'Password123!',
        },
        organization: {
          name: 'Modus Corp',
          email: 'contact@modus.local',
          currency: 'USD',
        },
      });

      expect(result.success).toBe(true);
      expect(result.administrator.email).toBe('admin@modus.local');
      expect(mockAccessControlService.initializeDefaultRolesAndPermissions).toHaveBeenCalled();
      expect(mockModuleRegistryService.initializeCoreModules).toHaveBeenCalled();
      expect(mockOrganizationService.getOrCreateSettings).toHaveBeenCalled();
      expect(mockAuditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'INITIAL_SETUP_COMPLETED',
        }),
      );
    });
  });
});
