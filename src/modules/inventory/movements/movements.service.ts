import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  MovementReferenceType,
  StockMovement,
  StockMovementDocument,
  StockMovementType,
} from './schemas/stock-movement.schema';
import { QueryStockMovementDto } from './dto/stock-movement.dto';
import {
  buildPaginationMeta,
  ensureValidObjectId,
  escapeRegex,
} from '../common/utils/transaction.util';
import type { InventoryActor } from '../common/schemas/inventory-actor.schema';

export interface RecordMovementInput {
  productId: Types.ObjectId;
  warehouseId: Types.ObjectId;
  movementType: StockMovementType;
  quantityChange: number;
  previousBalance: number;
  resultingBalance: number;
  referenceType: MovementReferenceType;
  referenceId: string;
  referenceNumber: string;
  description: string;
  actor: InventoryActor;
}

@Injectable()
export class MovementsService {
  constructor(
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovementDocument>,
  ) {}

  async recordMovement(
    input: RecordMovementInput,
    session?: ClientSession,
  ): Promise<StockMovementDocument> {
    const doc = new this.movementModel(input);
    return session ? doc.save({ session }) : doc.save();
  }

  async deleteManyByReference(
    referenceType: MovementReferenceType,
    referenceId: string,
  ): Promise<void> {
    await this.movementModel
      .deleteMany({ referenceType, referenceId })
      .exec();
  }

  async findAll(query: QueryStockMovementDto) {
    const filter: Record<string, any> = {};

    if (query.productId) {
      filter.productId = ensureValidObjectId(query.productId, 'product');
    }
    if (query.warehouseId) {
      filter.warehouseId = ensureValidObjectId(query.warehouseId, 'warehouse');
    }
    if (query.movementType) {
      filter.movementType = query.movementType;
    }
    if (query.referenceType) {
      filter.referenceType = query.referenceType;
    }
    if (query.referenceNumber && query.referenceNumber.trim()) {
      const refRegex = new RegExp(
        escapeRegex(query.referenceNumber.trim()),
        'i',
      );
      filter.$or = [{ referenceNumber: refRegex }, { referenceId: refRegex }];
    }

    if (query.startDate || query.endDate) {
      const createdFilter: Record<string, Date> = {};
      if (query.startDate) {
        createdFilter.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        // Include entire day when ISO date-only string is supplied
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.endDate.trim())) {
          end.setUTCHours(23, 59, 59, 999);
        }
        createdFilter.$lte = end;
      }
      filter.createdAt = createdFilter;
    }

    if (query.search && query.search.trim()) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      const searchConditions = [
        { referenceNumber: regex },
        { description: regex },
        { 'actor.email': regex },
      ];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.movementModel.countDocuments(filter).exec(),
      this.movementModel
        .find(filter)
        .populate({
          path: 'productId',
          select: 'name sku unitId',
          populate: { path: 'unitId', select: 'name symbol' },
        })
        .populate('warehouseId', 'name code')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(id: string) {
    const objId = ensureValidObjectId(id, 'stock movement');
    const doc = await this.movementModel
      .findById(objId)
      .populate({
        path: 'productId',
        select: 'name sku barcode unitId minStockThreshold',
        populate: { path: 'unitId', select: 'name symbol' },
      })
      .populate('warehouseId', 'name code')
      .exec();

    if (!doc) {
      throw new NotFoundException('Stock movement entry not found');
    }
    return doc;
  }
}
