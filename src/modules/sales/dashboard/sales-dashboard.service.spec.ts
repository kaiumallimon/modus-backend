import { Types } from 'mongoose';
import { SalesOrderStatus } from '../orders/schemas/sales-order.schema';
import { SalesDashboardService } from './sales-dashboard.service';

describe('SalesDashboardService', () => {
  it('separates Draft, Confirmed Commitment, and Fulfilled Revenue metrics cleanly', async () => {
    const customerModel: any = {
      countDocuments: jest
        .fn()
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(12) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(10) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(2) }),
      find: jest.fn().mockReturnValue({
        sort: () => ({
          limit: () => ({
            select: () => ({
              lean: () => ({ exec: jest.fn().mockResolvedValue([]) }),
            }),
          }),
        }),
      }),
    };

    const orderModel: any = {
      aggregate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: SalesOrderStatus.DRAFT, count: 2, totalValue: 400 },
          { _id: SalesOrderStatus.CONFIRMED, count: 3, totalValue: 900 },
          { _id: SalesOrderStatus.FULFILLED, count: 4, totalValue: 1200 },
          { _id: SalesOrderStatus.CANCELLED, count: 1, totalValue: 300 },
        ]),
      }),
      find: jest.fn().mockReturnValue({
        sort: () => ({
          limit: () => ({
            select: () => ({
              lean: () => ({ exec: jest.fn().mockResolvedValue([]) }),
            }),
          }),
        }),
      }),
    };

    const fulfillmentModel: any = {
      aggregate: jest
        .fn()
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue([
            {
              _id: null,
              fulfillmentCount: 5,
              fulfilledUnits: 42,
              fulfilledRevenue: 1350.5,
            },
          ]),
        })
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue([
            { _id: '2026-11-25', fulfillments: 2, units: 20, revenue: 600 },
            { _id: '2026-11-26', fulfillments: 3, units: 22, revenue: 750.5 },
          ]),
        })
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue([
            {
              _id: new Types.ObjectId(),
              productName: 'Steel Bolt Pack',
              sku: 'BLT-01',
              unitSymbol: 'box',
              unitsSold: 20,
              revenue: 800,
            },
          ]),
        }),
    };

    const service = new SalesDashboardService(
      customerModel,
      orderModel,
      fulfillmentModel,
    );

    const overview = await service.getOverview({ days: 30 });

    expect(overview.summary.draftOrdersCount).toBe(2);
    expect(overview.summary.draftOrdersValue).toBe(400);
    expect(overview.summary.committedOrdersCount).toBe(7);
    expect(overview.summary.committedValue).toBe(2100); // 900 + 1200, excludes Draft & Cancelled
    expect(overview.summary.fulfilledRevenue).toBe(1350.5);
    expect(overview.summary.fulfilledUnits).toBe(42);
    expect(overview.topSellingProducts).toHaveLength(1);
    expect(overview.dailyTrend).toHaveLength(2);
  });
});
