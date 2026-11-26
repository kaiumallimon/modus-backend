import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import {
  AdjustmentType,
  StockAdjustment,
  StockAdjustmentDocument,
} from './schemas/stock-adjustment.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import {
  Warehouse,
  WarehouseDocument,
} from '../warehouses/schemas/warehouse.schema';
import { StockService } from '../stock/stock.service';
import { MovementsService } from '../movements/movements.service';
import {
  MovementReferenceType,
  StockMovementType,
} from '../movements/schemas/stock-movement.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import type { AuditActorMeta } from '../categories/categories.service';
import {
  CreateStockAdjustmentDto,
  QueryStockAdjustmentDto,
} from './dto/adjustment.dto';
import {
  buildPaginationMeta,
  ensureValidObjectId,
  escapeRegex,
  generateReferenceNumber,
  runInTransaction,
} from '../common/utils/transaction.util';

const ADJUSTMENT_TO_MOVEMENT_MAP: Record<AdjustmentType, StockMovementType> = {
  [AdjustmentType.OPENING_STOCK]: StockMovementType.OPENING_STOCK,
  [AdjustmentType.INCREASE]: StockMovementType.ADJUSTMENT_INCREASE,
  [AdjustmentType.DECREASE]: StockMovementType.ADJUSTMENT_DECREASE,
};

@Injectable()
export class AdjustmentsService {
  constructor(
    @InjectModel(StockAdjustment.name)
    private readonly adjustmentModel: Model<StockAdjustmentDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Warehouse.name)
    private readonly warehouseModel: Model<WarehouseDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly stockService: StockService,
    private readonly movementsService: MovementsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(dto: CreateStockAdjustmentDto, audit: AuditActorMeta) {
    const productId = ensureValidObjectId(dto.productId, 'product');
    const warehouseId = ensureValidObjectId(dto.warehouseId, 'warehouse');

    const [product, warehouse] = await Promise.all([
      this.productModel.findById(productId).exec(),
      this.warehouseModel.findById(warehouseId).exec(),
    ]);

    if (!product) {
      throw new NotFoundException('Product not found');
    }
    if (!product.isActive) {
      throw new BadRequestException(
        `Product "${product.name}" (${product.sku}) is archived and cannot receive stock adjustments`,
      );
    }
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException(
        `Warehouse "${warehouse.name}" (${warehouse.code}) is deactivated and cannot receive stock adjustments`,
      );
    }

    const idempotencyKey = dto.idempotencyKey?.trim() || undefined;
    if (idempotencyKey) {
      const existingIdempotent = await this.adjustmentModel
        .findOne({ idempotencyKey })
        .exec();
      if (existingIdempotent) {
        throw new ConflictException(
          `Duplicate adjustment request: reference ${existingIdempotent.referenceNumber} was already processed`,
        );
      }
    }

    const referenceNumber =
      dto.referenceNumber?.toUpperCase().trim() ||
      generateReferenceNumber('ADJ');

    const duplicateRef = await this.adjustmentModel
      .findOne({ referenceNumber })
      .exec();
    if (duplicateRef) {
      throw new ConflictException(
        `Adjustment reference number "${referenceNumber}" already exists`,
      );
    }

    if (dto.adjustmentType === AdjustmentType.OPENING_STOCK) {
      const [currentQty, priorOpening] = await Promise.all([
        this.stockService.getCurrentQuantity(productId, warehouseId),
        this.adjustmentModel
          .findOne({
            productId,
            warehouseId,
            adjustmentType: AdjustmentType.OPENING_STOCK,
          })
          .exec(),
      ]);

      if (currentQty !== 0 || priorOpening) {
        throw new BadRequestException(
          'Opening stock has already been initialized or non-zero stock exists for this product in the selected warehouse. Use INCREASE or DECREASE instead.',
        );
      }
    }

    const signedDelta =
      dto.adjustmentType === AdjustmentType.DECREASE
        ? -dto.quantity
        : dto.quantity;

    let appliedBalance = false;
    let createdAdjustmentId: string | null = null;

    const saved = await runInTransaction(
      this.connection,
      async (session) => {
        const balanceRes = await this.stockService.applyDelta({
          productId,
          warehouseId,
          delta: signedDelta,
          session,
        });
        appliedBalance = true;

        const doc = new this.adjustmentModel({
          referenceNumber,
          ...(idempotencyKey ? { idempotencyKey } : {}),
          adjustmentType: dto.adjustmentType,
          productId,
          warehouseId,
          quantity: dto.quantity,
          previousQuantity: balanceRes.previousQuantity,
          resultingQuantity: balanceRes.resultingQuantity,
          reason: dto.reason.trim(),
          notes: dto.notes?.trim() || '',
          createdBy: audit.actor,
        });

        const savedAdj = session ? await doc.save({ session }) : await doc.save();
        createdAdjustmentId = savedAdj._id.toString();

        await this.movementsService.recordMovement(
          {
            productId,
            warehouseId,
            movementType: ADJUSTMENT_TO_MOVEMENT_MAP[dto.adjustmentType],
            quantityChange: signedDelta,
            previousBalance: balanceRes.previousQuantity,
            resultingBalance: balanceRes.resultingQuantity,
            referenceType: MovementReferenceType.ADJUSTMENT,
            referenceId: createdAdjustmentId,
            referenceNumber,
            description: `${dto.adjustmentType} (${product.sku} @ ${warehouse.code}): ${dto.reason.trim()}`,
            actor: audit.actor,
          },
          session,
        );

        return savedAdj;
      },
      async () => {
        if (appliedBalance) {
          await this.stockService
            .applyDelta({
              productId,
              warehouseId,
              delta: -signedDelta,
            })
            .catch(() => undefined);
        }
        if (createdAdjustmentId) {
          await this.movementsService
            .deleteManyByReference(
              MovementReferenceType.ADJUSTMENT,
              createdAdjustmentId,
            )
            .catch(() => undefined);
          await this.adjustmentModel
            .findByIdAndDelete(createdAdjustmentId)
            .exec()
            .catch(() => undefined);
        }
      },
    ).catch((err) => {
      if ((err as { code?: number })?.code === 11000) {
        throw new ConflictException(
          'Duplicate adjustment reference number or idempotency key detected',
        );
      }
      throw err;
    });

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'INVENTORY_STOCK_ADJUST',
      resource: 'inventory',
      resourceId: saved._id.toString(),
      description: `Recorded ${dto.adjustmentType} (${saved.referenceNumber}) for ${product.sku} at ${warehouse.code}: qty ${dto.quantity} (${saved.previousQuantity} -> ${saved.resultingQuantity})`,
      metadata: {
        referenceNumber: saved.referenceNumber,
        adjustmentType: dto.adjustmentType,
        productSku: product.sku,
        warehouseCode: warehouse.code,
        quantity: dto.quantity,
        previousQuantity: saved.previousQuantity,
        resultingQuantity: saved.resultingQuantity,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(saved._id.toString());
  }

  async findAll(query: QueryStockAdjustmentDto) {
    const filter: Record<string, any> = {};

    if (query.adjustmentType) {
      filter.adjustmentType = query.adjustmentType;
    }
    if (query.productId) {
      filter.productId = ensureValidObjectId(query.productId, 'product');
    }
    if (query.warehouseId) {
      filter.warehouseId = ensureValidObjectId(query.warehouseId, 'warehouse');
    }
    if (query.search && query.search.trim()) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [
        { referenceNumber: regex },
        { reason: regex },
        { notes: regex },
        { 'createdBy.email': regex },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.adjustmentModel.countDocuments(filter).exec(),
      this.adjustmentModel
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
    const objId = ensureValidObjectId(id, 'stock adjustment');
    const doc = await this.adjustmentModel
      .findById(objId)
      .populate({
        path: 'productId',
        select: 'name sku unitId',
        populate: { path: 'unitId', select: 'name symbol' },
      })
      .populate('warehouseId', 'name code')
      .exec();
    if (!doc) {
      throw new NotFoundException('Stock adjustment record not found');
    }
    return doc;
  }
}
