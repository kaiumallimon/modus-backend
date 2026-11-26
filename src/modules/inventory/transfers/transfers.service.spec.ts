import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { TransfersService } from './transfers.service';
import { TransferStatus } from './schemas/stock-transfer.schema';

describe('TransfersService', () => {
  let service: TransfersService;
  let mockTransferModel: any;
  let mockProductModel: any;
  let mockWarehouseModel: any;
  let mockStockService: any;
  let mockMovementsService: any;
  let mockAuditLogService: any;

  const whSource = new Types.ObjectId();
  const whDest = new Types.ObjectId();
  const prodId = new Types.ObjectId();
  const actor = { actor: { id: 'u1', email: 'admin@modus.local', role: 'SUPER_ADMIN' } };

  beforeEach(() => {
    mockTransferModel = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      findOneAndUpdate: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };
    mockProductModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: prodId,
          name: 'Sterile Gauze',
          sku: 'GAUZE-10',
          isActive: true,
        }),
      }),
    };
    mockWarehouseModel = {
      findById: jest.fn((id: Types.ObjectId) => ({
        exec: jest.fn().mockResolvedValue({
          _id: id,
          name: id.equals(whSource) ? 'Main' : 'Branch',
          code: id.equals(whSource) ? 'WH-MAIN' : 'WH-BR',
          isActive: true,
        }),
      })),
    };
    mockStockService = {
      getCurrentQuantity: jest.fn().mockResolvedValue(100),
      applyDelta: jest
        .fn()
        .mockResolvedValueOnce({ previousQuantity: 100, resultingQuantity: 75 })
        .mockResolvedValueOnce({ previousQuantity: 0, resultingQuantity: 25 }),
    };
    mockMovementsService = {
      recordMovement: jest.fn().mockResolvedValue({}),
      deleteManyByReference: jest.fn().mockResolvedValue(undefined),
    };
    mockAuditLogService = { record: jest.fn().mockResolvedValue(null) };

    service = new TransfersService(
      mockTransferModel,
      mockProductModel,
      mockWarehouseModel,
      {} as any,
      mockStockService,
      mockMovementsService,
      mockAuditLogService,
    );
  });

  it('rejects transfer creation when source and destination warehouses match', async () => {
    await expect(
      service.create(
        {
          sourceWarehouseId: whSource.toString(),
          destinationWarehouseId: whSource.toString(),
          items: [{ productId: prodId.toString(), quantity: 5 }],
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects transfer creation when source stock is insufficient', async () => {
    mockStockService.getCurrentQuantity.mockResolvedValue(4);

    await expect(
      service.create(
        {
          sourceWarehouseId: whSource.toString(),
          destinationWarehouseId: whDest.toString(),
          items: [{ productId: prodId.toString(), quantity: 10 }],
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('confirms pending transfer atomically, records TRANSFER_OUT and TRANSFER_IN, and rejects duplicate confirmation', async () => {
    const transferId = new Types.ObjectId();
    const pendingDoc = {
      _id: transferId,
      referenceNumber: 'TRF-20261126-01',
      sourceWarehouseId: whSource,
      destinationWarehouseId: whDest,
      items: [{ productId: prodId, quantity: 25 }],
      status: TransferStatus.CONFIRMED,
    };

    mockTransferModel.findOneAndUpdate
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(pendingDoc) })
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) });

    mockTransferModel.findById
      .mockReturnValueOnce({
        populate: () => ({
          populate: () => ({
            populate: () => ({ exec: jest.fn().mockResolvedValue(pendingDoc) }),
          }),
        }),
      })
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(pendingDoc) });

    await service.confirm(transferId.toString(), actor);

    expect(mockStockService.applyDelta).toHaveBeenCalledTimes(2);
    expect(mockMovementsService.recordMovement).toHaveBeenCalledTimes(2);
    expect(mockMovementsService.recordMovement).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ movementType: 'TRANSFER_OUT', quantityChange: -25 }),
      undefined,
    );
    expect(mockMovementsService.recordMovement).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ movementType: 'TRANSFER_IN', quantityChange: 25 }),
      undefined,
    );
    expect(mockAuditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INVENTORY_TRANSFER_CONFIRM' }),
    );

    // Second confirmation attempt must throw ConflictException (duplicate prevention)
    await expect(service.confirm(transferId.toString(), actor)).rejects.toThrow(
      ConflictException,
    );
  });
});
