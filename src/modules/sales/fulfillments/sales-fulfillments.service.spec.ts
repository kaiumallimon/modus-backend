import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  MovementReferenceType,
  StockMovementType,
} from '../../inventory/movements/schemas/stock-movement.schema';
import { SalesOrderStatus } from '../orders/schemas/sales-order.schema';
import { SalesFulfillmentsService } from './sales-fulfillments.service';

describe('SalesFulfillmentsService', () => {
  const orderId = new Types.ObjectId();
  const customerId = new Types.ObjectId();
  const warehouseId = new Types.ObjectId();
  const productA = new Types.ObjectId();
  const productB = new Types.ObjectId();
  const audit = {
    actor: { id: 'u1', email: 'fulfill@modus.local', name: 'Warehouse Lead' },
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };

  function makeHarness() {
    const session = {
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      abortTransaction: jest.fn(),
      endSession: jest.fn(),
    };
    const connection: any = {
      startSession: jest.fn().mockResolvedValue(session),
    };
    const fulfillmentModel: any = {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      create: jest.fn(),
      findById: jest.fn(),
      findByIdAndDelete: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    };
    const orderModel: any = {
      findById: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    };
    const warehouseModel: any = {
      findById: jest.fn().mockReturnValue({
        lean: () => ({
          exec: jest.fn().mockResolvedValue({ _id: warehouseId, name: 'Central', isActive: true }),
        }),
      }),
    };
    const stockService: any = {
      applyDelta: jest.fn(),
    };
    const movementsService: any = {
      recordMovement: jest.fn().mockResolvedValue(undefined),
      deleteManyByReference: jest.fn().mockResolvedValue(undefined),
    };
    const auditLogService: any = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SalesFulfillmentsService(
      connection,
      fulfillmentModel,
      orderModel,
      warehouseModel,
      stockService,
      movementsService,
      auditLogService,
    );

    return {
      service,
      fulfillmentModel,
      orderModel,
      stockService,
      movementsService,
      auditLogService,
    };
  }

  it('deducts stock via StockService, logs SALE_FULFILLMENT movement, and marks order PARTIALLY_FULFILLED', async () => {
    const { service, orderModel, fulfillmentModel, stockService, movementsService } =
      makeHarness();

    const baseOrder = {
      _id: orderId,
      orderNumber: 'SO-2026-0100',
      customerId,
      customerCodeSnapshot: 'CUS-100',
      customerNameSnapshot: 'Northstar Logistics',
      warehouseId,
      warehouseNameSnapshot: 'Central',
      currency: 'USD',
      status: SalesOrderStatus.CONFIRMED,
      items: [
        {
          productId: productA,
          productName: 'Thermal Label Roll',
          sku: 'LBL-100',
          unitName: 'Roll',
          unitSymbol: 'roll',
          orderedQuantity: 10,
          fulfilledQuantity: 0,
          unitPrice: 20,
          discountType: 'FIXED',
          discountValue: 0,
          discountAmount: 0,
          taxType: 'FIXED',
          taxValue: 0,
          taxAmount: 0,
          lineSubtotal: 200,
          lineTotal: 200,
        },
      ],
    };

    orderModel.findById.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue(baseOrder) }),
    });
    const makeOrderQuery = (val: any) => {
      const q: any = {
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(val),
      };
      return q;
    };
    orderModel.findOne
      .mockReturnValueOnce({
        session: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockRejectedValue(
            new Error('Transaction numbers are only allowed on a replica set member'),
          ),
      })
      .mockReturnValueOnce(makeOrderQuery(baseOrder));
    stockService.applyDelta.mockResolvedValue({
      previousQuantity: 25,
      resultingQuantity: 21,
    });
    orderModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        ...baseOrder,
        status: SalesOrderStatus.PARTIALLY_FULFILLED,
      }),
    });

    const createdId = new Types.ObjectId();
    fulfillmentModel.create.mockImplementation(async (payload: any) => ({
      ...payload,
      _id: createdId,
    }));
    fulfillmentModel.findById.mockReturnValue({
      populate: () => ({
        populate: () => ({
          populate: () => ({
            lean: () => ({
              exec: jest.fn().mockResolvedValue({
                _id: createdId,
                fulfillmentNumber: 'FUL-2026-001',
                totalFulfilledUnits: 4,
                totalFulfilledValue: 80,
              }),
            }),
          }),
        }),
      }),
    });

    const res = await service.fulfillOrder(
      orderId.toString(),
      {
        items: [{ productId: productA.toString(), fulfilledQuantity: 4 }],
      },
      audit,
    );

    expect(stockService.applyDelta).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: productA,
        warehouseId,
        delta: -4,
      }),
    );
    expect(movementsService.recordMovement).toHaveBeenCalledWith(
      expect.objectContaining({
        movementType: StockMovementType.SALE_FULFILLMENT,
        quantityChange: -4,
        previousBalance: 25,
        resultingBalance: 21,
        referenceType: MovementReferenceType.SALES_FULFILLMENT,
      }),
      undefined,
    );
    expect(orderModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: SalesOrderStatus.PARTIALLY_FULFILLED,
        }),
      }),
      expect.any(Object),
    );
    expect(res.totalFulfilledValue).toBe(80);
  });

  it('rolls back previously deducted stock lines if a second line fails mid-fulfillment', async () => {
    const { service, orderModel, stockService, movementsService } = makeHarness();

    const baseOrder = {
      _id: orderId,
      orderNumber: 'SO-2026-0101',
      customerId,
      customerCodeSnapshot: 'CUS-100',
      customerNameSnapshot: 'Northstar Logistics',
      warehouseId,
      warehouseNameSnapshot: 'Central',
      currency: 'USD',
      status: SalesOrderStatus.CONFIRMED,
      items: [
        {
          productId: productA,
          productName: 'Item A',
          sku: 'SKU-A',
          unitSymbol: 'pcs',
          orderedQuantity: 5,
          fulfilledQuantity: 0,
          unitPrice: 10,
          lineTotal: 50,
        },
        {
          productId: productB,
          productName: 'Item B',
          sku: 'SKU-B',
          unitSymbol: 'pcs',
          orderedQuantity: 5,
          fulfilledQuantity: 0,
          unitPrice: 10,
          lineTotal: 50,
        },
      ],
    };

    orderModel.findById.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue(baseOrder) }),
    });
    const makeOrderQuery = (val: any) => {
      const q: any = {
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(val),
      };
      return q;
    };
    orderModel.findOne
      .mockReturnValueOnce({
        session: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockRejectedValue(
            new Error('Transaction numbers are only allowed on a replica set member'),
          ),
      })
      .mockReturnValueOnce(makeOrderQuery(baseOrder));
    stockService.applyDelta
      .mockResolvedValueOnce({ previousQuantity: 10, resultingQuantity: 7 })
      .mockRejectedValueOnce(new BadRequestException('Insufficient stock'))
      .mockResolvedValueOnce({ previousQuantity: 7, resultingQuantity: 10 });

    await expect(
      service.fulfillOrder(
        orderId.toString(),
        {
          items: [
            { productId: productA.toString(), fulfilledQuantity: 3 },
            { productId: productB.toString(), fulfilledQuantity: 4 },
          ],
        },
        audit,
      ),
    ).rejects.toThrow(BadRequestException);

    // Rollback applied +3 back to productA and deleted SALE_FULFILLMENT movements
    expect(stockService.applyDelta).toHaveBeenCalledWith({
      productId: productA,
      warehouseId,
      delta: 3,
    });
    expect(movementsService.deleteManyByReference).toHaveBeenCalledWith(
      MovementReferenceType.SALES_FULFILLMENT,
      expect.any(String),
    );
  });

  it('rejects over-fulfillment beyond remaining ordered quantity', async () => {
    const { service, orderModel, stockService } = makeHarness();

    const baseOrder = {
      _id: orderId,
      orderNumber: 'SO-2026-0102',
      customerId,
      warehouseId,
      status: SalesOrderStatus.PARTIALLY_FULFILLED,
      items: [
        {
          productId: productA,
          productName: 'Item A',
          orderedQuantity: 5,
          fulfilledQuantity: 3,
          unitPrice: 10,
          lineTotal: 50,
        },
      ],
    };

    orderModel.findById.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue(baseOrder) }),
    });
    const makeOrderQuery = (val: any) => {
      const q: any = {
        session: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(val),
      };
      return q;
    };
    orderModel.findOne
      .mockReturnValueOnce({
        session: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockRejectedValue(
            new Error('Transaction numbers are only allowed on a replica set member'),
          ),
      })
      .mockReturnValueOnce(makeOrderQuery(baseOrder));

    await expect(
      service.fulfillOrder(
        orderId.toString(),
        { items: [{ productId: productA.toString(), fulfilledQuantity: 3 }] },
        audit,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(stockService.applyDelta).not.toHaveBeenCalled();
  });
});
