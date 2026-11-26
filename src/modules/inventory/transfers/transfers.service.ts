import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import {
  StockTransfer,
  StockTransferDocument,
  TransferStatus,
} from './schemas/stock-transfer.schema';
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
  CreateStockTransferDto,
  QueryStockTransferDto,
} from './dto/transfer.dto';
import {
  buildPaginationMeta,
  ensureValidObjectId,
  escapeRegex,
  generateReferenceNumber,
  runInTransaction,
} from '../common/utils/transaction.util';

@Injectable()
export class TransfersService {
  constructor(
    @InjectModel(StockTransfer.name)
    private readonly transferModel: Model<StockTransferDocument>,
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

  async create(dto: CreateStockTransferDto, audit: AuditActorMeta) {
    const sourceId = ensureValidObjectId(
      dto.sourceWarehouseId,
      'source warehouse',
    );
    const destId = ensureValidObjectId(
      dto.destinationWarehouseId,
      'destination warehouse',
    );

    if (sourceId.equals(destId)) {
      throw new BadRequestException(
        'Source and destination warehouses must be different',
      );
    }

    const [sourceWh, destWh] = await Promise.all([
      this.warehouseModel.findById(sourceId).exec(),
      this.warehouseModel.findById(destId).exec(),
    ]);

    if (!sourceWh) {
      throw new NotFoundException('Source warehouse not found');
    }
    if (!sourceWh.isActive) {
      throw new BadRequestException(
        `Source warehouse "${sourceWh.name}" (${sourceWh.code}) is deactivated`,
      );
    }
    if (!destWh) {
      throw new NotFoundException('Destination warehouse not found');
    }
    if (!destWh.isActive) {
      throw new BadRequestException(
        `Destination warehouse "${destWh.name}" (${destWh.code}) is deactivated`,
      );
    }

    const idempotencyKey = dto.idempotencyKey?.trim() || undefined;
    if (idempotencyKey) {
      const existingIdempotent = await this.transferModel
        .findOne({ idempotencyKey })
        .exec();
      if (existingIdempotent) {
        throw new ConflictException(
          `Duplicate transfer request: reference ${existingIdempotent.referenceNumber} already exists`,
        );
      }
    }

    const referenceNumber =
      dto.referenceNumber?.toUpperCase().trim() ||
      generateReferenceNumber('TRF');

    const dupRef = await this.transferModel
      .findOne({ referenceNumber })
      .exec();
    if (dupRef) {
      throw new ConflictException(
        `Transfer reference number "${referenceNumber}" already exists`,
      );
    }

    const seenProducts = new Set<string>();
    const normalizedItems: Array<{ productId: Types.ObjectId; quantity: number }> =
      [];

    for (const item of dto.items) {
      const prodObjId = ensureValidObjectId(item.productId, 'product');
      const prodKey = prodObjId.toString();
      if (seenProducts.has(prodKey)) {
        throw new BadRequestException(
          'Duplicate product entry in transfer items; combine quantities into a single line',
        );
      }
      seenProducts.add(prodKey);

      const product = await this.productModel.findById(prodObjId).exec();
      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }
      if (!product.isActive) {
        throw new BadRequestException(
          `Product "${product.name}" (${product.sku}) is archived and cannot be transferred`,
        );
      }

      const available = await this.stockService.getCurrentQuantity(
        prodObjId,
        sourceId,
      );
      if (available < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock in "${sourceWh.name}" for product "${product.name}" (${product.sku}): available ${available}, requested ${item.quantity}`,
        );
      }

      normalizedItems.push({
        productId: prodObjId,
        quantity: item.quantity,
      });
    }

    const created = await this.transferModel
      .create({
        referenceNumber,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        sourceWarehouseId: sourceId,
        destinationWarehouseId: destId,
        items: normalizedItems,
        notes: dto.notes?.trim() || '',
        status: TransferStatus.PENDING,
        createdBy: audit.actor,
        confirmedBy: null,
        confirmedAt: null,
      })
      .catch((err) => {
        if ((err as { code?: number })?.code === 11000) {
          throw new ConflictException(
            'Duplicate transfer reference number or idempotency key detected',
          );
        }
        throw err;
      });

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'INVENTORY_TRANSFER_CREATE',
      resource: 'inventory',
      resourceId: created._id.toString(),
      description: `Created pending stock transfer ${created.referenceNumber} (${sourceWh.code} -> ${destWh.code}) with ${normalizedItems.length} item(s)`,
      metadata: {
        referenceNumber: created.referenceNumber,
        sourceWarehouse: sourceWh.code,
        destinationWarehouse: destWh.code,
        itemsCount: normalizedItems.length,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(created._id.toString());
  }

  async confirm(id: string, audit: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'stock transfer');
    const appliedDeltas: Array<{
      productId: Types.ObjectId;
      warehouseId: Types.ObjectId;
      delta: number;
    }> = [];
    let claimedInFallback = false;

    const confirmedDoc = await runInTransaction(
      this.connection,
      async (session) => {
        const claimed = await this.transferModel
          .findOneAndUpdate(
            { _id: objId, status: TransferStatus.PENDING },
            {
              $set: {
                status: TransferStatus.CONFIRMED,
                confirmedBy: audit.actor,
                confirmedAt: new Date(),
              },
            },
            {
              new: true,
              ...(session ? { session } : {}),
            },
          )
          .exec();

        if (!claimed) {
          const existingQuery = this.transferModel.findById(objId);
          if (session) existingQuery.session(session);
          const existing = await existingQuery.exec();

          if (!existing) {
            throw new NotFoundException('Stock transfer not found');
          }
          throw new ConflictException(
            `Transfer "${existing.referenceNumber}" has already been confirmed`,
          );
        }

        claimedInFallback = !session;

        const [sourceWh, destWh] = await Promise.all([
          this.warehouseModel.findById(claimed.sourceWarehouseId).exec(),
          this.warehouseModel.findById(claimed.destinationWarehouseId).exec(),
        ]);

        if (!sourceWh || !sourceWh.isActive) {
          throw new BadRequestException(
            'Source warehouse is missing or deactivated',
          );
        }
        if (!destWh || !destWh.isActive) {
          throw new BadRequestException(
            'Destination warehouse is missing or deactivated',
          );
        }

        // Sort items deterministically by productId to prevent multi-doc lock contention deadlocks
        const orderedItems = [...claimed.items].sort((a, b) =>
          a.productId.toString().localeCompare(b.productId.toString()),
        );

        for (const item of orderedItems) {
          const product = await this.productModel.findById(item.productId).exec();
          if (!product) {
            throw new NotFoundException(
              `Product ${item.productId.toString()} no longer exists`,
            );
          }

          const srcResult = await this.stockService.applyDelta({
            productId: item.productId,
            warehouseId: claimed.sourceWarehouseId,
            delta: -item.quantity,
            session,
          });
          appliedDeltas.push({
            productId: item.productId,
            warehouseId: claimed.sourceWarehouseId,
            delta: -item.quantity,
          });

          const dstResult = await this.stockService.applyDelta({
            productId: item.productId,
            warehouseId: claimed.destinationWarehouseId,
            delta: item.quantity,
            session,
          });
          appliedDeltas.push({
            productId: item.productId,
            warehouseId: claimed.destinationWarehouseId,
            delta: item.quantity,
          });

          const transferIdStr = claimed._id.toString();

          await this.movementsService.recordMovement(
            {
              productId: item.productId,
              warehouseId: claimed.sourceWarehouseId,
              movementType: StockMovementType.TRANSFER_OUT,
              quantityChange: -item.quantity,
              previousBalance: srcResult.previousQuantity,
              resultingBalance: srcResult.resultingQuantity,
              referenceType: MovementReferenceType.TRANSFER,
              referenceId: transferIdStr,
              referenceNumber: claimed.referenceNumber,
              description: `Transfer out to ${destWh.code} (${claimed.referenceNumber}) for ${product.sku}`,
              actor: audit.actor,
            },
            session,
          );

          await this.movementsService.recordMovement(
            {
              productId: item.productId,
              warehouseId: claimed.destinationWarehouseId,
              movementType: StockMovementType.TRANSFER_IN,
              quantityChange: item.quantity,
              previousBalance: dstResult.previousQuantity,
              resultingBalance: dstResult.resultingQuantity,
              referenceType: MovementReferenceType.TRANSFER,
              referenceId: transferIdStr,
              referenceNumber: claimed.referenceNumber,
              description: `Transfer in from ${sourceWh.code} (${claimed.referenceNumber}) for ${product.sku}`,
              actor: audit.actor,
            },
            session,
          );
        }

        return claimed;
      },
      async () => {
        for (const op of [...appliedDeltas].reverse()) {
          await this.stockService
            .applyDelta({
              productId: op.productId,
              warehouseId: op.warehouseId,
              delta: -op.delta,
            })
            .catch(() => undefined);
        }
        await this.movementsService
          .deleteManyByReference(MovementReferenceType.TRANSFER, id)
          .catch(() => undefined);
        if (claimedInFallback) {
          await this.transferModel
            .findByIdAndUpdate(objId, {
              $set: {
                status: TransferStatus.PENDING,
                confirmedBy: null,
                confirmedAt: null,
              },
            })
            .exec()
            .catch(() => undefined);
        }
      },
    );

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'INVENTORY_TRANSFER_CONFIRM',
      resource: 'inventory',
      resourceId: confirmedDoc._id.toString(),
      description: `Confirmed stock transfer ${confirmedDoc.referenceNumber} (${confirmedDoc.items.length} line item(s) applied atomically)`,
      metadata: {
        referenceNumber: confirmedDoc.referenceNumber,
        itemsCount: confirmedDoc.items.length,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(id);
  }

  async findAll(query: QueryStockTransferDto) {
    const filter: Record<string, any> = {};

    if (query.status) {
      filter.status = query.status;
    }
    if (query.sourceWarehouseId) {
      filter.sourceWarehouseId = ensureValidObjectId(
        query.sourceWarehouseId,
        'source warehouse',
      );
    }
    if (query.destinationWarehouseId) {
      filter.destinationWarehouseId = ensureValidObjectId(
        query.destinationWarehouseId,
        'destination warehouse',
      );
    }
    if (query.search && query.search.trim()) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [
        { referenceNumber: regex },
        { notes: regex },
        { 'createdBy.email': regex },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.transferModel.countDocuments(filter).exec(),
      this.transferModel
        .find(filter)
        .populate('sourceWarehouseId', 'name code')
        .populate('destinationWarehouseId', 'name code')
        .populate({
          path: 'items.productId',
          select: 'name sku unitId',
          populate: { path: 'unitId', select: 'name symbol' },
        })
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
    const objId = ensureValidObjectId(id, 'stock transfer');
    const doc = await this.transferModel
      .findById(objId)
      .populate('sourceWarehouseId', 'name code isActive')
      .populate('destinationWarehouseId', 'name code isActive')
      .populate({
        path: 'items.productId',
        select: 'name sku unitId',
        populate: { path: 'unitId', select: 'name symbol' },
      })
      .exec();

    if (!doc) {
      throw new NotFoundException('Stock transfer not found');
    }
    return doc;
  }
}
