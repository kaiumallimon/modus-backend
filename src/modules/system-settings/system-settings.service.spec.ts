import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';
import {
  SINGLETON_SYSTEM_SETTINGS_KEY,
  SystemSettings,
} from './schemas/system-settings.schema';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('SystemSettingsService', () => {
  let service: SystemSettingsService;
  let mockSettingsModel: any;
  let mockAuditLogService: { record: jest.Mock };

  beforeEach(async () => {
    mockSettingsModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };

    mockAuditLogService = {
      record: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemSettingsService,
        {
          provide: getModelToken(SystemSettings.name),
          useValue: mockSettingsModel,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<SystemSettingsService>(SystemSettingsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateSettings', () => {
    it('should throw BadRequestException if customPreferences contains secret keys', async () => {
      const mockDoc: any = {
        key: SINGLETON_SYSTEM_SETTINGS_KEY,
        customPreferences: {},
        save: jest.fn().mockResolvedValue(this),
      };

      mockSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoc),
      });

      await expect(
        service.updateSettings({
          customPreferences: {
            api_secret_key: 'confidential_secret',
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update settings successfully and record audit log', async () => {
      const mockDoc: any = {
        _id: 'sys123',
        key: SINGLETON_SYSTEM_SETTINGS_KEY,
        defaultPaginationLimit: 10,
        customPreferences: {},
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };

      mockSettingsModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoc),
      });

      const updated = await service.updateSettings(
        {
          defaultPaginationLimit: 25,
          customPreferences: { theme: 'dark' },
        },
        { id: 'admin1', email: 'admin@modus.local' },
      );

      expect(updated.defaultPaginationLimit).toBe(25);
      expect(updated.customPreferences.theme).toBe('dark');
      expect(mockAuditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SYSTEM_SETTINGS_UPDATE',
          resource: 'settings',
        }),
      );
    });
  });
});
