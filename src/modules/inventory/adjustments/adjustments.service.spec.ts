import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdjustmentsService } from './adjustments.service';
import { AdjustmentType } from './schemas/stock-adjustment.schema';

describe('AdjustmentsService', () => {
  let service: AdjustmentsService;
  let mockAdjustmentModel: any;
  let mockProductModel: any;
  let mockWarehouseModel: any;
  let mockStockService: any;
  let mockMovementsService: any;
  let mockAuditLogService: any;

  const productId = new Types.ObjectId().toString();
  const warehouseId = new Types.ObjectId().toString();
  const actor = { actor: { id: 'u1', email: 'admin@modus.local', role: 'SUPER_ADMIN' } };

  beforeEach(() => {
    mockAdjustmentModel = jest.fn().mockImplementation((payload) => ({
      ...payload,
      _id: new Types.ObjectId(),
      save: jest.fn().mockResolvedValue({ ...payload, _id: new Types.ObjectId() }),
    }));
    mockAdjustmentModel.findOne = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
    mockAdjustmentModel.findById = jest.fn();

    mockProductModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(productId),
          name: 'Surgical Mask',
          sku: 'MASK-01',
          isActive: true,
        }),
      }),
    };
    mockWarehouseModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(warehouseId),
          name: 'Main',
          code: 'WH-MAIN',
          isActive: true,
        }),
      }),
    };
    mockStockService = {
      getCurrentQuantity: jest.fn().mockResolvedValue(0),
      applyDelta: jest.fn().mockResolvedValue({ previousQuantity: 0, resultingQuantity: 50 }),
    };
    mockMovementsService = {
      recordMovement: jest.fn().mockResolvedValue({}),
      deleteManyByReference: jest.fn().mockResolvedValue(undefined),
    };
    mockAuditLogService = { record: jest.fn().mockResolvedValue(null) };

    service = new AdjustmentsService(
      mockAdjustmentModel,
      mockProductModel,
      mockWarehouseModel,
      {} as any,
      mockStockService,
      mockMovementsService,
      mockAuditLogService,
    );
  });

  it('prevents duplicate OPENING_STOCK when stock already initialized', async () => {
    mockStockService.getCurrentQuantity.mockResolvedValue(15);

    await expect(
      service.create(
        {
          adjustmentType: AdjustmentType.OPENING_STOCK,
          productId,
          warehouseId,
          quantity: 10,
          reason: 'Re-opening',
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('prevents duplicate submission using idempotencyKey', async () => {
    mockAdjustmentModel.findOne.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue({ referenceNumber: 'ADJ-20261126-ABC' }),
    });

    await expect(
      service.create(
        {
          adjustmentType: AdjustmentType.INCREASE,
          productId,
          warehouseId,
          quantity: 10,
          reason: 'Retry test',
          idempotencyKey: 'key-123',
        },
        actor,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('applies backend-calculated balance, records movement ledger entry, and logs audit event', async () => {
    const savedDoc = {
      _id: new Types.ObjectId(),
      referenceNumber: 'ADJ-20261126-001',
      previousQuantity: 0,
      resultingQuantity: 50,
    };
    mockAdjustmentModel.mockImplementation((payload: any) => ({
      ...payload,
      _id: savedDoc._id,
      save: jest.fn().mockResolvedValue({ ...payload, _id: savedDoc._id }),
    }));
    mockAdjustmentModel.findById.mockReturnValue({
      populate: () => ({ populate: () => ({ exec: jest.fn().mockResolvedValue(savedDoc) }) }),
    });

    await service.create(
      {
        adjustmentType: AdjustmentType.OPENING_STOCK,
        productId,
        warehouseId,
        quantity: 50,
        reason: 'Initial count',
        referenceNumber: 'ADJ-20261126-001',
      },
      actor,
    );

    expect(mockStockService.applyDelta).toHaveBeenCalledWith(
      expect.objectContaining({ delta: 50 }),
    );
    expect(mockMovementsService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        movementType: 'OPENING_STOCK',
        quantityChange: 50,
        previousBalance: 0,
        resultingBalance: 50,
      }),
      undefined,
    );
    expect(mockAuditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INVENTORY_STOCK_ADJUST' }),
    );
  });
});
