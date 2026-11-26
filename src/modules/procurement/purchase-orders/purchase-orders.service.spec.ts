import { BadRequestException, ConflictException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrderStatus } from './schemas/purchase-order.schema';
import { PricingAdjustmentType } from '../common/utils/money.util';

describe('PurchaseOrdersService', () => {
  let service: PurchaseOrdersService;
  let mockPoModel: any;
  let mockSupplierModel: any;
  let mockProductModel: any;
  let mockWarehouseModel: any;
  let mockReceiptModel: any;
  let mockAuditLogService: any;

  const supId = new Types.ObjectId();
  const whId = new Types.ObjectId();
  const prodId = new Types.ObjectId();
  const poId = new Types.ObjectId();
  const actor = {
    actor: { id: 'u1', email: 'buyer@modus.local', role: 'MANAGER' },
  };

  beforeEach(() => {
    mockPoModel = {
      create: jest.fn(),
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
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
      find: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([
            {
              _id: prodId,
              name: 'Nitrile Gloves Box',
              sku: 'GLV-100',
              isActive: true,
              unitId: { name: 'Box', symbol: 'box' },
            },
          ]),
        }),
      }),
      countDocuments: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
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
    mockReceiptModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
      countDocuments: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(0),
      }),
    };
    mockAuditLogService = { record: jest.fn().mockResolvedValue(null) };

    service = new PurchaseOrdersService(
      mockPoModel,
      mockSupplierModel,
      mockProductModel,
      mockWarehouseModel,
      mockReceiptModel,
      mockAuditLogService,
    );
  });

  const setupFindOneMock = (doc: any) => {
    mockPoModel.findById.mockReturnValueOnce({
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

  it('calculates monetary line totals and order totals accurately in cents without float drift', async () => {
    mockPoModel.create.mockImplementation(async (payload: any) => ({
      _id: poId,
      ...payload,
    }));
    setupFindOneMock({ _id: poId, orderNumber: 'PO-TEST-1', grandTotal: 112.86 });

    await service.create(
      {
        supplierId: supId.toString(),
        destinationWarehouseId: whId.toString(),
        items: [
          {
            productId: prodId.toString(),
            orderedQuantity: 3,
            unitPrice: 33.33, // subtotal 99.99
            discountType: PricingAdjustmentType.FIXED,
            discountValue: 4.99, // taxable 95.00
            taxType: PricingAdjustmentType.PERCENTAGE,
            taxValue: 10, // tax 9.50 -> total 104.50
          },
        ],
      },
      actor,
    );

    expect(mockPoModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: 99.99,
        discountTotal: 4.99,
        taxTotal: 9.5,
        grandTotal: 104.5,
        status: PurchaseOrderStatus.DRAFT,
      }),
    );
  });

  it('rejects duplicate product lines in the same purchase order', async () => {
    await expect(
      service.create(
        {
          supplierId: supId.toString(),
          destinationWarehouseId: whId.toString(),
          items: [
            { productId: prodId.toString(), orderedQuantity: 10, unitPrice: 5 },
            { productId: prodId.toString(), orderedQuantity: 2, unitPrice: 5 },
          ],
        },
        actor,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('transitions DRAFT -> ORDERED cleanly via submit()', async () => {
    const draftDoc = {
      _id: poId,
      orderNumber: 'PO-20261126-ABCDEF',
      supplierId: supId,
      supplierNameSnapshot: 'MediCore Supplies',
      destinationWarehouseId: whId,
      status: PurchaseOrderStatus.DRAFT,
      items: [{ productId: prodId }],
      grandTotal: 500,
    };
    mockPoModel.findById.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue(draftDoc),
    });
    mockPoModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        ...draftDoc,
        status: PurchaseOrderStatus.ORDERED,
      }),
    });
    setupFindOneMock({ ...draftDoc, status: PurchaseOrderStatus.ORDERED });

    const res = await service.submit(poId.toString(), actor);
    expect(res.status).toBe(PurchaseOrderStatus.ORDERED);
    expect(mockAuditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PROCUREMENT_PO_SUBMIT' }),
    );
  });

  it('blocks submitting non-DRAFT purchase orders', async () => {
    mockPoModel.findById.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue({
        _id: poId,
        orderNumber: 'PO-1',
        status: PurchaseOrderStatus.RECEIVED,
      }),
    });

    await expect(service.submit(poId.toString(), actor)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('blocks cancelling ORDERED purchase order once goods have been received', async () => {
    mockPoModel.findById.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue({
        _id: poId,
        orderNumber: 'PO-1',
        status: PurchaseOrderStatus.ORDERED,
        items: [{ productId: prodId, orderedQuantity: 20, receivedQuantity: 5 }],
      }),
    });

    await expect(
      service.cancel(poId.toString(), { reason: 'Test' }, actor),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws ConflictException when concurrent submit already claimed DRAFT', async () => {
    mockPoModel.findById.mockReturnValueOnce({
      exec: jest.fn().mockResolvedValue({
        _id: poId,
        orderNumber: 'PO-CONC',
        supplierId: supId,
        destinationWarehouseId: whId,
        status: PurchaseOrderStatus.DRAFT,
        items: [{ productId: prodId }],
      }),
    });
    mockPoModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    await expect(service.submit(poId.toString(), actor)).rejects.toThrow(
      ConflictException,
    );
  });
});
