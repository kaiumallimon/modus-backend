import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  StockBalance,
  StockBalanceDocument,
} from './schemas/stock-balance.schema';
import { QueryStockDto } from './dto/stock.dto';
import {
  buildPaginationMeta,
  ensureValidObjectId,
  escapeRegex,
} from '../common/utils/transaction.util';

export interface ApplyStockDeltaInput {
  productId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  delta: number;
  session?: ClientSession;
}

export interface ApplyStockDeltaResult {
  previousQuantity: number;
  resultingQuantity: number;
  balance: StockBalanceDocument;
}

function roundQty(val: number): number {
  return Math.round(val * 10000) / 10000;
}

@Injectable()
export class StockService {
  constructor(
    @InjectModel(StockBalance.name)
    private readonly balanceModel: Model<StockBalanceDocument>,
  ) {}

  async getCurrentQuantity(
    productId: Types.ObjectId,
    warehouseId: Types.ObjectId,
    session?: ClientSession,
  ): Promise<number> {
    const query = this.balanceModel.findOne({ productId, warehouseId });
    if (session) query.session(session);
    const doc = await query.exec();
    return doc?.quantity ?? 0;
  }

  /**
   * Atomically increments or decrements warehouse-specific stock balance.
   * Negative stock is prevented at the MongoDB query filter level (`quantity: { $gte: absDelta }`).
   */
  async applyDelta({
    productId,
    warehouseId,
    delta,
    session,
  }: ApplyStockDeltaInput): Promise<ApplyStockDeltaResult> {
    if (!Number.isFinite(delta) || delta === 0) {
      throw new BadRequestException('Stock quantity delta must be a non-zero number');
    }

    const cleanDelta = roundQty(delta);

    if (cleanDelta > 0) {
      const before = await this.balanceModel
        .findOneAndUpdate(
          { productId, warehouseId },
          { $inc: { quantity: cleanDelta } },
          {
            upsert: true,
            new: false,
            ...(session ? { session } : {}),
          },
        )
        .exec();

      const previousQuantity = roundQty(before?.quantity ?? 0);
      const resultingQuantity = roundQty(previousQuantity + cleanDelta);

      const updatedQuery = this.balanceModel.findOne({ productId, warehouseId });
      if (session) updatedQuery.session(session);
      const updated = (await updatedQuery.exec())!;

      return {
        previousQuantity,
        resultingQuantity,
        balance: updated,
      };
    }

    const absDelta = Math.abs(cleanDelta);
    const before = await this.balanceModel
      .findOneAndUpdate(
        { productId, warehouseId, quantity: { $gte: absDelta } },
        { $inc: { quantity: -absDelta } },
        {
          new: false,
          ...(session ? { session } : {}),
        },
      )
      .exec();

    if (!before) {
      const available = await this.getCurrentQuantity(
        productId,
        warehouseId,
        session,
      );
      throw new BadRequestException(
        `Insufficient stock balance: available ${available}, requested decrease ${absDelta}`,
      );
    }

    const previousQuantity = roundQty(before.quantity);
    const resultingQuantity = roundQty(previousQuantity - absDelta);

    const updatedQuery = this.balanceModel.findOne({ productId, warehouseId });
    if (session) updatedQuery.session(session);
    const updated = (await updatedQuery.exec())!;

    return {
      previousQuantity,
      resultingQuantity,
      balance: updated,
    };
  }

  async findAll(query: QueryStockDto) {
    const matchStage: Record<string, any> = {};
    if (query.productId) {
      matchStage.productId = ensureValidObjectId(query.productId, 'product');
    }
    if (query.warehouseId) {
      matchStage.warehouseId = ensureValidObjectId(
        query.warehouseId,
        'warehouse',
      );
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const pipeline: any[] = [];
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    pipeline.push(
      {
        $lookup: {
          from: 'inventory_products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      {
        $lookup: {
          from: 'inventory_warehouses',
          localField: 'warehouseId',
          foreignField: '_id',
          as: 'warehouse',
        },
      },
      { $unwind: '$warehouse' },
      {
        $lookup: {
          from: 'inventory_categories',
          localField: 'product.categoryId',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'inventory_units',
          localField: 'product.unitId',
          foreignField: '_id',
          as: 'unit',
        },
      },
      { $unwind: { path: '$unit', preserveNullAndEmptyArrays: true } },
      {
        $addFields: {
          minThreshold: { $ifNull: ['$product.minStockThreshold', 0] },
        },
      },
      {
        $addFields: {
          stockStatus: {
            $cond: [
              { $lte: ['$quantity', 0] },
              'OUT_OF_STOCK',
              {
                $cond: [
                  {
                    $and: [
                      { $gt: ['$minThreshold', 0] },
                      { $lte: ['$quantity', '$minThreshold'] },
                    ],
                  },
                  'LOW_STOCK',
                  'IN_STOCK',
                ],
              },
            ],
          },
        },
      },
    );

    const postFilter: Record<string, any> = {};
    if (query.stockStatus) {
      postFilter.stockStatus = query.stockStatus;
    }
    if (query.search && query.search.trim()) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      postFilter.$or = [
        { 'product.name': regex },
        { 'product.sku': regex },
        { 'warehouse.name': regex },
        { 'warehouse.code': regex },
      ];
    }
    if (Object.keys(postFilter).length > 0) {
      pipeline.push({ $match: postFilter });
    }

    pipeline.push({
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $sort: { updatedAt: -1, _id: 1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              quantity: 1,
              stockStatus: 1,
              updatedAt: 1,
              createdAt: 1,
              productId: '$product._id',
              warehouseId: '$warehouse._id',
              product: {
                _id: '$product._id',
                name: '$product.name',
                sku: '$product.sku',
                barcode: '$product.barcode',
                minStockThreshold: '$product.minStockThreshold',
                isActive: '$product.isActive',
                imageUrl: '$product.imageUrl',
              },
              category: {
                _id: '$category._id',
                name: '$category.name',
              },
              unit: {
                _id: '$unit._id',
                name: '$unit.name',
                symbol: '$unit.symbol',
              },
              warehouse: {
                _id: '$warehouse._id',
                name: '$warehouse.name',
                code: '$warehouse.code',
                isActive: '$warehouse.isActive',
              },
            },
          },
        ],
      },
    });

    const [aggResult] = await this.balanceModel.aggregate(pipeline).exec();
    const total = aggResult?.metadata?.[0]?.total ?? 0;
    const data = aggResult?.data ?? [];

    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }
}
