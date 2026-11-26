import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { WarehousesService } from './warehouses.service';

describe('WarehousesService', () => {
  let service: WarehousesService;
  let mockWarehouseModel: any;
  let mockBalanceModel: any;
  let mockMovementModel: any;
  let mockTransferModel: any;
  let mockAuditLogService: any;

  const whId = new Types.ObjectId().toString();

  beforeEach(() => {
    mockWarehouseModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      findByIdAndDelete: jest.fn(),
    };
    mockBalanceModel = {
      countDocuments: jest.fn(),
      find: jest.fn(),
      aggregate: jest.fn().mockResolvedValue([]),
    };
    mockMovementModel = {
      countDocuments: jest.fn(),
      find: jest.fn(),
    };
    mockTransferModel = { countDocuments: jest.fn() };
    mockAuditLogService = { record: jest.fn().mockResolvedValue(null) };

    service = new WarehousesService(
      mockWarehouseModel,
      mockBalanceModel,
      mockMovementModel,
      mockTransferModel,
      mockAuditLogService,
    );
  });

  it('enforces unique warehouse code on create', async () => {
    mockWarehouseModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ code: 'WH-MAIN' }),
    });

    await expect(
      service.create({ name: 'Main Warehouse', code: 'wh-main' }),
    ).rejects.toThrow(ConflictException);
  });

  it('prevents deleting a warehouse with existing stock or historical transfers/movements', async () => {
    mockWarehouseModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(whId),
        name: 'Main',
        code: 'WH-MAIN',
      }),
    });
    mockBalanceModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });
    mockMovementModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(2) });
    mockTransferModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

    await expect(service.remove(whId)).rejects.toThrow(BadRequestException);
    expect(mockWarehouseModel.findByIdAndDelete).not.toHaveBeenCalled();
  });

  it('creates warehouse and records audit event', async () => {
    const objId = new Types.ObjectId(whId);
    mockWarehouseModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    mockWarehouseModel.create.mockResolvedValue({
      _id: objId,
      name: 'Cold Storage',
      code: 'WH-COLD',
    });
    mockWarehouseModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: objId,
        name: 'Cold Storage',
        code: 'WH-COLD',
        toObject: () => ({ _id: whId, name: 'Cold Storage', code: 'WH-COLD' }),
      }),
    });
    mockBalanceModel.find.mockReturnValue({
      populate: () => ({
        sort: () => ({ limit: () => ({ exec: jest.fn().mockResolvedValue([]) }) }),
      }),
    });
    mockMovementModel.find.mockReturnValue({
      populate: () => ({
        sort: () => ({ limit: () => ({ exec: jest.fn().mockResolvedValue([]) }) }),
      }),
    });

    const created = await service.create(
      { name: 'Cold Storage', code: 'wh-cold' },
      { actor: { id: 'u1', email: 'admin@modus.local' } },
    );

    expect(created.code).toBe('WH-COLD');
    expect(mockAuditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INVENTORY_WAREHOUSE_CREATE' }),
    );
  });
});
