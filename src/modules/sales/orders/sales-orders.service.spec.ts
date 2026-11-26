import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { SalesOrdersService } from './sales-orders.service';
import { SalesOrderStatus } from './schemas/sales-order.schema';

describe('SalesOrdersService', () => {
  const customerId = new Types.ObjectId();
  const warehouseId = new Types.ObjectId();
  const productId = new Types.ObjectId();
  const orderId = new Types.ObjectId();
  const audit = {
    actor: { id: 'u1', email: 'sales@modus.local', name: 'Sales Rep' },
    ipAddress: '127.0.0.1',
    userAgent: 'jest',
  };

  function makeService() {
    const orderModel: any = {
      create: jest.fn(),
      findById: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    const customerModel: any = { findById: jest.fn() };
    const warehouseModel: any = { findById: jest.fn() };
    const productModel: any = { find: jest.fn() };
    const fulfillmentModel: any = {
      find: jest.fn().mockReturnValue({
        sort: () => ({ lean: () => ({ exec: jest.fn().mockResolvedValue([]) }) }),
      }),
    };
    const stockService: any = {
      getCurrentQuantity: jest.fn(),
    };
    const auditLogService: any = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SalesOrdersService(
      orderModel,
      customerModel,
      warehouseModel,
      productModel,
      fulfillmentModel,
      stockService,
      auditLogService,
    );

    return {
      service,
      orderModel,
      customerModel,
      warehouseModel,
      productModel,
      stockService,
      auditLogService,
    };
  }

  it('rejects duplicate products inside a single sales order', async () => {
    const { service, customerModel, warehouseModel } = makeService();
    customerModel.findById.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({
          _id: customerId,
          code: 'CUS-1',
          name: 'Apex Co',
          phone: '+1 555 200 1000',
          isActive: true,
        }),
      }),
    });
    warehouseModel.findById.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({
          _id: warehouseId,
          name: 'Main Warehouse',
          isActive: true,
        }),
      }),
    });

    await expect(
      service.create(
        {
          customerId: customerId.toString(),
          warehouseId: warehouseId.toString(),
          items: [
            { productId: productId.toString(), orderedQuantity: 2 },
            { productId: productId.toString(), orderedQuantity: 3 },
          ],
        },
        audit,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('blocks confirming a draft order when warehouse stock is insufficient', async () => {
    const { service, orderModel, customerModel, warehouseModel, stockService } =
      makeService();
    orderModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: orderId,
        orderNumber: 'SO-2026-0001',
        customerId,
        warehouseId,
        status: SalesOrderStatus.DRAFT,
        items: [
          {
            productId,
            productName: 'Industrial Valve',
            sku: 'VALVE-01',
            orderedQuantity: 10,
            fulfilledQuantity: 0,
          },
        ],
      }),
    });
    customerModel.findById.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue({ _id: customerId, isActive: true }) }),
    });
    warehouseModel.findById.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({
          _id: warehouseId,
          name: 'Main Hub',
          isActive: true,
        }),
      }),
    });
    stockService.getCurrentQuantity.mockResolvedValue(4);

    await expect(service.confirm(orderId.toString(), audit)).rejects.toThrow(
      BadRequestException,
    );
    expect(orderModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('confirms a draft order when stock is sufficient without deducting stock early', async () => {
    const {
      service,
      orderModel,
      customerModel,
      warehouseModel,
      stockService,
      auditLogService,
    } = makeService();
    const orderDoc = {
      _id: orderId,
      orderNumber: 'SO-2026-0002',
      customerId,
      customerCodeSnapshot: 'CUS-1',
      customerNameSnapshot: 'Apex Co',
      customerPhoneSnapshot: '+1 555 200 1000',
      customerEmailSnapshot: null,
      warehouseId,
      warehouseNameSnapshot: 'Main Hub',
      orderDate: new Date(),
      currency: 'USD',
      grandTotal: 150,
      status: SalesOrderStatus.DRAFT,
      items: [
        {
          productId,
          productName: 'Industrial Valve',
          sku: 'VALVE-01',
          unitName: 'Piece',
          unitSymbol: 'pcs',
          orderedQuantity: 5,
          fulfilledQuantity: 0,
          unitPrice: 30,
          discountType: 'FIXED',
          discountValue: 0,
          discountAmount: 0,
          taxType: 'FIXED',
          taxValue: 0,
          taxAmount: 0,
          lineSubtotal: 150,
          lineTotal: 150,
        },
      ],
    };

    orderModel.findById
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(orderDoc) })
      .mockReturnValueOnce({
        populate: () => ({
          populate: () => ({
            lean: () => ({
              exec: jest.fn().mockResolvedValue({
                ...orderDoc,
                status: SalesOrderStatus.CONFIRMED,
              }),
            }),
          }),
        }),
      });
    customerModel.findById.mockReturnValue({
      lean: () => ({ exec: jest.fn().mockResolvedValue({ _id: customerId, isActive: true }) }),
    });
    warehouseModel.findById.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({
          _id: warehouseId,
          name: 'Main Hub',
          isActive: true,
        }),
      }),
    });
    stockService.getCurrentQuantity.mockResolvedValue(12);
    orderModel.findOneAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        ...orderDoc,
        status: SalesOrderStatus.CONFIRMED,
      }),
    });

    const confirmed = await service.confirm(orderId.toString(), audit);
    expect(confirmed.status).toBe(SalesOrderStatus.CONFIRMED);
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SALES_ORDER_CONFIRM' }),
    );
  });

  it('prevents cancelling orders with any fulfilled items', async () => {
    const { service, orderModel } = makeService();
    orderModel.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: orderId,
        orderNumber: 'SO-2026-0003',
        status: SalesOrderStatus.PARTIALLY_FULFILLED,
        items: [{ productId, orderedQuantity: 10, fulfilledQuantity: 3 }],
      }),
    });

    await expect(
      service.cancel(orderId.toString(), { reason: 'Customer changed mind' }, audit),
    ).rejects.toThrow(BadRequestException);
  });
});
