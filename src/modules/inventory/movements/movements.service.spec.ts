import { Types } from 'mongoose';
import { MovementsService } from './movements.service';
import { InventoryDashboardService } from '../dashboard/dashboard.service';

describe('MovementsService & InventoryDashboardService', () => {
  it('MovementsService retrieves ledger entries without exposing mutation routes', async () => {
    const mockMovementModel: any = {
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(1) }),
      find: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([{ movementType: 'OPENING_STOCK', quantityChange: 10 }]),
      }),
    };

    const service = new MovementsService(mockMovementModel);
    const res = await service.findAll({ page: 1, limit: 10 });
    expect(res.data).toHaveLength(1);
    expect(res.meta.total).toBe(1);
  });

  it('DashboardService calculates out-of-stock, low-stock, and total stock units precisely', async () => {
    const prodA = new Types.ObjectId();
    const prodB = new Types.ObjectId();
    const prodC = new Types.ObjectId();

    const makeCount = (n: number) => ({ exec: jest.fn().mockResolvedValue(n) });

    const service = new InventoryDashboardService(
      {
        countDocuments: jest.fn(() => makeCount(3)),
        find: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          populate: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([
            { _id: prodA, name: 'Zero Item', sku: 'Z-1', minStockThreshold: 10 },
            { _id: prodB, name: 'Low Item', sku: 'L-1', minStockThreshold: 20 },
            { _id: prodC, name: 'Healthy Item', sku: 'H-1', minStockThreshold: 10 },
          ]),
        }),
      } as any,
      { countDocuments: jest.fn(() => makeCount(2)) } as any,
      { countDocuments: jest.fn(() => makeCount(9)) } as any,
      { countDocuments: jest.fn(() => makeCount(2)) } as any,
      {
        aggregate: jest
          .fn()
          .mockReturnValueOnce({
            exec: jest.fn().mockResolvedValue([
              { _id: prodB, totalQuantity: 15 },
              { _id: prodC, totalQuantity: 100 },
            ]),
          })
          .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue([]) }),
      } as any,
      {
        find: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([]),
        }),
      } as any,
      { countDocuments: jest.fn(() => makeCount(1)) } as any,
    );

    const summary = await service.getSummary();
    expect(summary.metrics.totalActiveProducts).toBe(3);
    expect(summary.metrics.totalStockUnits).toBe(115);
    expect(summary.metrics.outOfStockProductsCount).toBe(1);
    expect(summary.metrics.lowStockProductsCount).toBe(1);
    expect(summary.metrics.pendingTransfersCount).toBe(1);
    expect(summary.lowStockProducts.map((p) => p.sku)).toEqual(['Z-1', 'L-1']);
  });
});
