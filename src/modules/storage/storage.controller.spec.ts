import { Test, TestingModule } from '@nestjs/testing';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { AuditLogService } from '../audit-log/audit-log.service';

describe('StorageController', () => {
  let controller: StorageController;
  let mockStorageService: Partial<Record<keyof StorageService, jest.Mock>>;
  let mockAuditLogService: { record: jest.Mock };

  beforeEach(async () => {
    mockStorageService = {
      getStats: jest.fn().mockResolvedValue({
        bucketName: 'portfolio-website',
        status: 'active',
        totalObjects: 5,
        totalSizeBytes: 1024,
        formattedTotalSize: '1.0 KB',
      }),
      listObjects: jest.fn().mockResolvedValue({
        objects: [],
        folders: [],
        totalCount: 0,
      }),
      uploadAsset: jest.fn().mockResolvedValue({
        key: 'assets/test.png',
        url: 'https://cdn.example.com/assets/test.png',
        size: 1024,
        name: 'test.png',
        formattedSize: '1.0 KB',
      }),
      deleteObjects: jest.fn().mockResolvedValue({ deleted: 1 }),
    };

    mockAuditLogService = {
      record: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        { provide: StorageService, useValue: mockStorageService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    controller = module.get<StorageController>(StorageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return storage stats', async () => {
    const stats = await controller.getStats();
    expect(mockStorageService.getStats).toHaveBeenCalled();
    expect(stats.bucketName).toBe('portfolio-website');
  });

  it('should list objects with filters', async () => {
    await controller.listObjects('avatars', 10, undefined, 'user');
    expect(mockStorageService.listObjects).toHaveBeenCalledWith({
      prefix: 'avatars',
      limit: 10,
      cursor: undefined,
      search: 'user',
    });
  });

  it('should upload asset and log audit trail', async () => {
    const mockFile = { buffer: Buffer.from('test'), size: 1024, originalname: 'test.png' } as any;
    const result = await controller.uploadAsset(mockFile, 'avatars', 'user-1', 'admin@example.com');
    expect(mockStorageService.uploadAsset).toHaveBeenCalledWith(mockFile, 'avatars');
    expect(mockAuditLogService.record).toHaveBeenCalled();
    expect(result.key).toBe('assets/test.png');
  });

  it('should delete objects and log audit trail', async () => {
    const result = await controller.deleteObjects(['assets/test.png'], 'user-1', 'admin@example.com');
    expect(mockStorageService.deleteObjects).toHaveBeenCalledWith(['assets/test.png']);
    expect(mockAuditLogService.record).toHaveBeenCalled();
    expect(result.deleted).toBe(1);
  });
});
