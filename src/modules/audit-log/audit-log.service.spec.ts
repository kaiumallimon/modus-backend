import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './schemas/audit-log.schema';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let mockAuditLogModel: any;

  beforeEach(async () => {
    mockAuditLogModel = jest.fn().mockImplementation((entry) => ({
      ...entry,
      save: jest.fn().mockResolvedValue({ _id: 'audit123', ...entry }),
    }));

    mockAuditLogModel.find = jest.fn();
    mockAuditLogModel.findById = jest.fn();
    mockAuditLogModel.countDocuments = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: getModelToken(AuditLog.name),
          useValue: mockAuditLogModel,
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('record', () => {
    it('should sanitize passwords, tokens, and secrets from metadata', async () => {
      const entry = {
        actor: { id: 'user1', email: 'user@modus.local' },
        action: 'USER_LOGIN',
        resource: 'auth',
        description: 'User logged in',
        metadata: {
          password: 'SecretPassword123!',
          refreshToken: 'refresh-jwt-token',
          safeData: 'visible information',
        },
      };

      const result = await service.record(entry);

      expect(result).toBeDefined();
      expect(result!.metadata).toEqual({ safeData: 'visible information' });
      expect(result!.metadata.password).toBeUndefined();
      expect(result!.metadata.refreshToken).toBeUndefined();
    });

    it('should catch database errors gracefully without throwing', async () => {
      mockAuditLogModel.mockImplementationOnce(() => ({
        save: jest.fn().mockRejectedValue(new Error('DB failure')),
      }));

      const result = await service.record({
        actor: { id: 'user1', email: 'user@modus.local' },
        action: 'FAIL_ACTION',
        resource: 'test',
        description: 'Failed save',
      });

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return paginated audit logs', async () => {
      const mockLogs = [
        { action: 'LOGIN', description: 'User login' },
        { action: 'LOGOUT', description: 'User logout' },
      ];

      mockAuditLogModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(2),
      });

      mockAuditLogModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(mockLogs),
      });

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual(mockLogs);
      expect(result.meta.total).toBe(2);
      expect(result.meta.page).toBe(1);
    });
  });
});
