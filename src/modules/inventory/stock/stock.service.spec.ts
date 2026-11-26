import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { StockService } from './stock.service';

describe('StockService', () => {
  let service: StockService;
  let inMemoryBalances: Map<string, number>;
  let mockBalanceModel: any;

  const productId = new Types.ObjectId();
  const warehouseId = new Types.ObjectId();

  beforeEach(() => {
    inMemoryBalances = new Map();

    mockBalanceModel = {
      findOne: jest.fn(({ productId: pId, warehouseId: wId }) => ({
        session: jest.fn().mockReturnThis(),
        exec: jest.fn(async () => {
          const key = `${pId.toString()}:${wId.toString()}`;
          if (!inMemoryBalances.has(key)) return null;
          return { productId: pId, warehouseId: wId, quantity: inMemoryBalances.get(key)! };
        }),
      })),
      findOneAndUpdate: jest.fn((filter, update, opts) => ({
        exec: jest.fn(async () => {
          const key = `${filter.productId.toString()}:${filter.warehouseId.toString()}`;
          const current = inMemoryBalances.get(key) ?? 0;

          if (filter.quantity?.$gte !== undefined && current < filter.quantity.$gte) {
            return null;
          }

          if (!inMemoryBalances.has(key) && !opts?.upsert) {
            return null;
          }

          const delta = update.$inc?.quantity ?? 0;
          const prevDoc = inMemoryBalances.has(key)
            ? { productId: filter.productId, warehouseId: filter.warehouseId, quantity: current }
            : null;

          inMemoryBalances.set(key, Math.round((current + delta) * 10000) / 10000);
          return prevDoc;
        }),
      })),
    };

    service = new StockService(mockBalanceModel);
  });

  it('initializes balance via positive delta and increases/decreases accurately', async () => {
    const open = await service.applyDelta({ productId, warehouseId, delta: 100 });
    expect(open.previousQuantity).toBe(0);
    expect(open.resultingQuantity).toBe(100);

    const inc = await service.applyDelta({ productId, warehouseId, delta: 25 });
    expect(inc.previousQuantity).toBe(100);
    expect(inc.resultingQuantity).toBe(125);

    const dec = await service.applyDelta({ productId, warehouseId, delta: -40 });
    expect(dec.previousQuantity).toBe(125);
    expect(dec.resultingQuantity).toBe(85);
  });

  it('prevents negative stock and handles concurrent decreases safely', async () => {
    await service.applyDelta({ productId, warehouseId, delta: 30 });

    await expect(
      service.applyDelta({ productId, warehouseId, delta: -31 }),
    ).rejects.toThrow(BadRequestException);

    // Concurrent decreases of 20 each against balance 30: exactly 1 succeeds, 1 fails
    const results = await Promise.allSettled([
      service.applyDelta({ productId, warehouseId, delta: -20 }),
      service.applyDelta({ productId, warehouseId, delta: -20 }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(await service.getCurrentQuantity(productId, warehouseId)).toBe(10);
  });
});
