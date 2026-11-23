import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { OrganizationService } from './organization.service';
import {
  OrganizationSettings,
  SINGLETON_ORGANIZATION_KEY,
} from './schemas/organization.schema';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('OrganizationService', () => {
  let service: OrganizationService;
  let mockOrgModel: any;
  let mockAuditLogService: { record: jest.Mock };

  beforeEach(async () => {
    mockOrgModel = {
      findOne: jest.fn(),
      create: jest.fn(),
    };

    mockAuditLogService = {
      record: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        {
          provide: getModelToken(OrganizationSettings.name),
          useValue: mockOrgModel,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<OrganizationService>(OrganizationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrCreateSettings', () => {
    it('should return existing singleton organization settings', async () => {
      const existing = {
        key: SINGLETON_ORGANIZATION_KEY,
        name: 'Existing Org',
        email: 'info@existing.com',
      };

      mockOrgModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(existing),
      });

      const result = await service.getOrCreateSettings();

      expect(result).toBe(existing);
      expect(mockOrgModel.create).not.toHaveBeenCalled();
    });

    it('should create singleton record if none exists', async () => {
      const created = {
        key: SINGLETON_ORGANIZATION_KEY,
        name: 'Modus Organization',
        email: 'contact@modus.local',
      };

      mockOrgModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      mockOrgModel.create.mockResolvedValue(created);

      const result = await service.getOrCreateSettings();

      expect(mockOrgModel.create).toHaveBeenCalled();
      expect(result).toBe(created);
    });
  });

  describe('updateSettings', () => {
    it('should update organization fields and record audit log', async () => {
      const mockDoc: any = {
        _id: 'org123',
        key: SINGLETON_ORGANIZATION_KEY,
        name: 'Old Name',
        email: 'old@modus.local',
        currency: 'USD',
        address: {},
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };

      mockOrgModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDoc),
      });

      const updated = await service.updateSettings(
        {
          name: 'New Acme Org',
          currency: 'EUR',
          address: { city: 'Berlin', country: 'Germany' },
        },
        { id: 'admin1', email: 'admin@modus.local', role: 'SUPER_ADMIN' },
      );

      expect(updated.name).toBe('New Acme Org');
      expect(updated.currency).toBe('EUR');
      expect(updated.address.city).toBe('Berlin');
      expect(mockAuditLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ORGANIZATION_SETTINGS_UPDATE',
          resource: 'organization',
        }),
      );
    });
  });
});
