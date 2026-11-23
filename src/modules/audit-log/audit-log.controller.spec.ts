import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let mockAuditLogService: {
    findAll: jest.Mock;
    findById: jest.Mock;
  };

  beforeEach(async () => {
    mockAuditLogService = {
      findAll: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
      findById: jest.fn().mockResolvedValue({ action: 'TEST_ACTION' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    controller = module.get<AuditLogController>(AuditLogController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return paginated audit logs', async () => {
    const result = await controller.findAll({ page: 1, limit: 10 });
    expect(result).toEqual({ data: [], meta: { total: 0 } });
    expect(mockAuditLogService.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it('should return single audit log by ID', async () => {
    const result = await controller.findOne('audit123');
    expect(result).toEqual({ action: 'TEST_ACTION' });
    expect(mockAuditLogService.findById).toHaveBeenCalledWith('audit123');
  });
});
