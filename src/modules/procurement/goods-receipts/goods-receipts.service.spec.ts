import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { GoodsReceiptsService } from './goods-receipts.service';
import { GoodsReceiptStatus } from './schemas/goods-receipt.schema';
import { PurchaseOrderStatus } from '../purchase-orders/schemas/purchase-order.schema';
import {
  MovementReferenceType,
  StockMovementType,
} from '../../inventory/movements/schemas/stock-movement.schema';

describe('GoodsReceiptsService (Inventory Integration & Transaction Safety)', () => {
  let service: GoodsReceiptsService;
  let mockReceiptModel: any;
  let mockPoModel: any;
  let mockSupplierModel: any;
  let mockProductModel: any;
  let mockWarehouseModel: any;
  let mockStockService: any;
  let mockMovementsService: any;
  let mockAuditLogService: any;

  const poId = new Types.ObjectId();
  const supId = new Types.ObjectId();
  const whId = new Types.ObjectId();
  const prodId = new Types.ObjectId();
  const receiptId = new Types.ObjectId();
  const actor = {
    actor: { id: 'u1', email: 'receiver@modus.local', role: 'MANAGER' },
  };

  beforeEach(() => {
    mockReceiptModel = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      findOneAndUpdate: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };
    mockPoModel = {
      findById: jest.fn(),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
    };
    mockSupplierModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: supId,
          name: 'MediCore Supplies',
          code: 'SUP-MEDI',
          isActive: true,
        }),
      }),
    };
    mockProductModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: prodId,
          name: 'Amoxicillin 500mg',
          sku: 'AMOX-500',
          isActive: true,
        }),
      }),
    };
    mockWarehouseModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: whId,
          name: 'Main Warehouse',
          code: 'WH-MAIN',
          isActive: true,
        }),
      }),
    };
    mockStockService = {
      applyDelta: jest.fn().mockResolvedValue({
        previousQuantity: 10,
        resultingQuantity: 50,
      }),
    };
    mockMovementsService = {
      recordMovement: jest.fn().mockResolvedValue({}),
      deleteManyByReference: jest.fn().mockResolvedValue(undefined),
    };
    mockAuditLogService = { record: jest.fn().mockResolvedValue(null) };

    service = new GoodsReceiptsService(
      {} as any, // standalone fallback connection
      mockReceiptModel,
      mockPoModel,
      mockSupplierModel,
      mockProductModel,
      mockWarehouseModel,
      mockStockService,
      mockMovementsService,
      mockAuditLogService,
    );
  });

  const setupFindOneMock = (doc: any) => {
    mockReceiptModel.findById.mockReturnValueOnce({
      populate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue(doc),
            }),
          }),
        }),
      }),
    });
  };

  it('prevents over-receiving beyond remaining PO quantity', async () => {
    mockPoModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: poId,
        orderNumber: 'PO-100',
        supplierId: supId,
        destinationWarehouseId: whId,
        status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
        items: [
          {
            productId: prodId,
            productName: 'Amoxicillin 500mg',
            sku: 'AMOX-500',
            unitSymbol: 'box',
            orderedQuantity: 100,
            receivedQuantity: 75,
            unitPrice: 10,
            lineTotal: 1000,
          },
        ],
      }),
    });

    await expect(
      service.create(
        {
          purchaseOrderId: poId.toString(),
          items: [{ productId: prodId.toString(), receivedQuantity: 30 }],
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('handles partial receiving (40 of 100 -> PARTIALLY_RECEIVED) and increases Inventory stock via StockService', async () => {
    const claimedDoc: any = {
      _id: receiptId,
      receiptNumber: 'GRN-001',
      purchaseOrderId: poId,
      purchaseOrderNumber: 'PO-100',
      supplierId: supId,
      destinationWarehouseId: whId,
      status: GoodsReceiptStatus.CONFIRMED,
      totalReceivedUnits: 40,
      totalReceivedValue: 400,
      items: [
        {
          productId: prodId,
          productName: 'Amoxicillin 500mg',
          sku: 'AMOX-500',
          unitSymbol: 'box',
          orderedQuantity: 100,
          previouslyReceivedQuantity: 0,
          receivedQuantity: 40,
          remainingQuantity: 60,
          unitPrice: 10,
          lineReceivedAmount: 400,
        },
      ],
      save: jest.fn().mockResolvedValue(true),
    };
    const poDoc: any = {
      _id: poId,
      orderNumber: 'PO-100',
      supplierId: supId,
      destinationWarehouseId: whId,
      status: PurchaseOrderStatus.ORDERED,
      items: [
        {
          productId: prodId,
          productName: 'Amoxicillin 500mg',
          sku: 'AMOX-500',
          orderedQuantity: 100,
          receivedQuantity: 0,
        },
      ],
      save: jest.fn().mockResolvedValue(true),
    };

    mockReceiptModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(claimedDoc),
    });
    mockPoModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(poDoc),
    });
    setupFindOneMock({ ...claimedDoc });

    await service.confirm(receiptId.toString(), {}, actor);

    expect(mockStockService.applyDelta).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: prodId,
        warehouseId: whId,
        delta: 40,
      }),
    );
    expect(mockMovementsService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        movementType: StockMovementType.PURCHASE_RECEIPT,
        referenceType: MovementReferenceType.GOODS_RECEIPT,
        quantityChange: 40,
        previousBalance: 10,
        resultingBalance: 50,
      }),
      undefined,
    );
    expect(poDoc.status).toBe(PurchaseOrderStatus.PARTIALLY_RECEIVED);
    expect(poDoc.items[0].receivedQuantity).toBe(40);
  });

  it('transitions PO to RECEIVED on final remaining units', async () => {
    const claimedDoc: any = {
      _id: receiptId,
      receiptNumber: 'GRN-002',
      purchaseOrderId: poId,
      purchaseOrderNumber: 'PO-100',
      supplierId: supId,
      destinationWarehouseId: whId,
      status: GoodsReceiptStatus.CONFIRMED,
      totalReceivedUnits: 25,
      totalReceivedValue: 250,
      items: [
        {
          productId: prodId,
          sku: 'AMOX-500',
          orderedQuantity: 100,
          previouslyReceivedQuantity: 75,
          receivedQuantity: 25,
          remainingQuantity: 0,
        },
      ],
      save: jest.fn().mockResolvedValue(true),
    };
    const poDoc: any = {
      _id: poId,
      orderNumber: 'PO-100',
      supplierId: supId,
      destinationWarehouseId: whId,
      status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
      items: [
        {
          productId: prodId,
          sku: 'AMOX-500',
          orderedQuantity: 100,
          receivedQuantity: 75,
        },
      ],
      save: jest.fn().mockResolvedValue(true),
    };

    mockReceiptModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(claimedDoc),
    });
    mockPoModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(poDoc),
    });
    setupFindOneMock({ ...claimedDoc });

    await service.confirm(receiptId.toString(), {}, actor);
    expect(poDoc.status).toBe(PurchaseOrderStatus.RECEIVED);
    expect(poDoc.items[0].receivedQuantity).toBe(100);
  });

  it('blocks duplicate receipt confirmation with ConflictException', async () => {
    mockReceiptModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });
    mockReceiptModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: receiptId,
        receiptNumber: 'GRN-001',
        status: GoodsReceiptStatus.CONFIRMED,
      }),
    });

    await expect(
      service.confirm(receiptId.toString(), {}, actor),
    ).rejects.toThrow(ConflictException);
  });

  it('rolls back stock updates and movements if PO save fails in standalone fallback', async () => {
    const claimedDoc: any = {
      _id: receiptId,
      receiptNumber: 'GRN-FAIL',
      purchaseOrderId: poId,
      purchaseOrderNumber: 'PO-100',
      supplierId: supId,
      destinationWarehouseId: whId,
      status: GoodsReceiptStatus.CONFIRMED,
      items: [
        {
          productId: prodId,
          sku: 'AMOX-500',
          orderedQuantity: 50,
          receivedQuantity: 20,
        },
      ],
      save: jest.fn(),
    };
    const poDoc: any = {
      _id: poId,
      orderNumber: 'PO-100',
      supplierId: supId,
      destinationWarehouseId: whId,
      status: PurchaseOrderStatus.ORDERED,
      items: [{ productId: prodId, sku: 'AMOX-500', orderedQuantity: 50, receivedQuantity: 0 }],
      save: jest.fn().mockRejectedValue(new Error('DB write timeout')),
    };

    mockReceiptModel.findOneAndUpdate
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(claimedDoc) })
      .mockReturnValue({ catch: jest.fn() });
    mockPoModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue(poDoc),
    });

    await expect(
      service.confirm(receiptId.toString(), {}, actor),
    ).rejects.toThrow('DB write timeout');

    expect(mockStockService.applyDelta).toHaveBeenCalledWith(
      expect.objectContaining({ delta: 20 }),
    );
    expect(mockStockService.applyDelta).toHaveBeenCalledWith(
      expect.objectContaining({ delta: -20 }),
    );
    expect(mockMovementsService.deleteManyByReference).toHaveBeenCalledWith(
      MovementReferenceType.GOODS_RECEIPT,
      receiptId.toString(),
    );
  });
});
