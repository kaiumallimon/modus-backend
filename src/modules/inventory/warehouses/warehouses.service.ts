import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Warehouse, WarehouseDocument } from './schemas/warehouse.schema';
import {
  StockBalance,
  StockBalanceDocument,
} from '../stock/schemas/stock-balance.schema';
import {
  StockMovement,
  StockMovementDocument,
} from '../movements/schemas/stock-movement.schema';
import {
  StockTransfer,
  StockTransferDocument,
} from '../transfers/schemas/stock-transfer.schema';
import {
  CreateWarehouseDto,
  QueryWarehouseDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import type { AuditActorMeta } from '../categories/categories.service';
import {
  buildPaginationMeta,
  ensureValidObjectId,
  escapeRegex,
} from '../common/utils/transaction.util';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectModel(Warehouse.name)
    private readonly warehouseModel: Model<WarehouseDocument>,
    @InjectModel(StockBalance.name)
    private readonly balanceModel: Model<StockBalanceDocument>,
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovementDocument>,
    @InjectModel(StockTransfer.name)
    private readonly transferModel: Model<StockTransferDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(dto: CreateWarehouseDto, audit?: AuditActorMeta) {
    const code = dto.code.toUpperCase().trim();
    const existing = await this.warehouseModel.findOne({ code }).exec();
    if (existing) {
      throw new ConflictException(`Warehouse code "${code}" already exists`);
    }

    const isActive = dto.isActive !== undefined ? dto.isActive : true;
    const doc = await this.warehouseModel.create({
      name: dto.name.trim(),
      code,
      description: dto.description?.trim() || '',
      address: dto.address || {},
      isActive,
      deactivatedAt: isActive ? null : new Date(),
    });

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_WAREHOUSE_CREATE',
        resource: 'inventory',
        resourceId: doc._id.toString(),
        description: `Created warehouse "${doc.name}" (${doc.code})`,
        metadata: { code: doc.code, name: doc.name },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return this.findOne(doc._id.toString());
  }

  async findAll(query: QueryWarehouseDto) {
    const filter: Record<string, any> = {};
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }
    if (query.search && query.search.trim()) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [
        { name: regex },
        { code: regex },
        { description: regex },
        { 'address.city': regex },
        { 'address.country': regex },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [total, docs] = await Promise.all([
      this.warehouseModel.countDocuments(filter).exec(),
      this.warehouseModel
        .find(filter)
        .sort({ isActive: -1, name: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    const warehouseIds = docs.map((d) => d._id);
    const balanceAgg =
      warehouseIds.length > 0
        ? await this.balanceModel.aggregate([
            { $match: { warehouseId: { $in: warehouseIds }, quantity: { $gt: 0 } } },
            {
              $group: {
                _id: '$warehouseId',
                stockedProductsCount: { $sum: 1 },
                totalStockUnits: { $sum: '$quantity' },
              },
            },
          ])
        : [];
    const aggMap = new Map(
      balanceAgg.map(
        (b: {
          _id: Types.ObjectId;
          stockedProductsCount: number;
          totalStockUnits: number;
        }) => [b._id.toString(), b],
      ),
    );

    const data = docs.map((doc) => {
      const summary = aggMap.get(doc._id.toString());
      return Object.assign({}, doc.toObject(), {
        stockedProductsCount: summary?.stockedProductsCount ?? 0,
        totalStockUnits: summary?.totalStockUnits ?? 0,
      });
    });

    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(id: string) {
    const objId = ensureValidObjectId(id, 'warehouse');
    const doc = await this.warehouseModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Warehouse not found');
    }

    const [balanceSummary, recentMovements] = await Promise.all([
      this.balanceModel
        .find({ warehouseId: objId, quantity: { $gt: 0 } })
        .populate({
          path: 'productId',
          select: 'name sku minStockThreshold unitId',
          populate: { path: 'unitId', select: 'name symbol' },
        })
        .sort({ quantity: -1 })
        .limit(20)
        .exec(),
      this.movementModel
        .find({ warehouseId: objId })
        .populate('productId', 'name sku')
        .sort({ createdAt: -1 })
        .limit(10)
        .exec(),
    ]);

    const totalStockUnits = balanceSummary.reduce(
      (sum, item) => sum + (item.quantity || 0),
      0,
    );

    return Object.assign({}, doc.toObject(), {
      stockedProductsCount: balanceSummary.length,
      totalStockUnits,
      stockItems: balanceSummary,
      recentMovements,
    });
  }

  async update(id: string, dto: UpdateWarehouseDto, audit?: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'warehouse');
    const doc = await this.warehouseModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Warehouse not found');
    }

    if (dto.code !== undefined) {
      const nextCode = dto.code.toUpperCase().trim();
      const duplicate = await this.warehouseModel
        .findOne({ code: nextCode, _id: { $ne: objId } })
        .exec();
      if (duplicate) {
        throw new ConflictException(`Warehouse code "${nextCode}" already exists`);
      }
      doc.code = nextCode;
    }

    if (dto.name !== undefined) {
      doc.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      doc.description = dto.description.trim();
    }
    if (dto.address !== undefined) {
      doc.address = Object.assign({}, doc.address, dto.address);
    }
    if (dto.isActive !== undefined) {
      doc.isActive = dto.isActive;
      doc.deactivatedAt = dto.isActive ? null : new Date();
    }

    await doc.save();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_WAREHOUSE_UPDATE',
        resource: 'inventory',
        resourceId: doc._id.toString(),
        description: `Updated warehouse "${doc.name}" (${doc.code})`,
        metadata: {
          code: doc.code,
          updatedFields: Object.keys(dto),
          isActive: doc.isActive,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return this.findOne(id);
  }

  async deactivate(id: string, audit?: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'warehouse');
    const doc = await this.warehouseModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Warehouse not found');
    }

    doc.isActive = false;
    doc.deactivatedAt = doc.deactivatedAt || new Date();
    await doc.save();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_WAREHOUSE_DEACTIVATE',
        resource: 'inventory',
        resourceId: doc._id.toString(),
        description: `Deactivated warehouse "${doc.name}" (${doc.code})`,
        metadata: { code: doc.code },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return this.findOne(id);
  }

  async remove(id: string, audit?: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'warehouse');
    const doc = await this.warehouseModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Warehouse not found');
    }

    const [hasBalances, hasMovements, hasTransfers] = await Promise.all([
      this.balanceModel.countDocuments({ warehouseId: objId }).exec(),
      this.movementModel.countDocuments({ warehouseId: objId }).exec(),
      this.transferModel
        .countDocuments({
          $or: [{ sourceWarehouseId: objId }, { destinationWarehouseId: objId }],
        })
        .exec(),
    ]);

    if (hasBalances > 0 || hasMovements > 0 || hasTransfers > 0) {
      throw new BadRequestException(
        `Cannot delete warehouse "${doc.name}" (${doc.code}) because it has stock or movement history. Deactivate it instead.`,
      );
    }

    await this.warehouseModel.findByIdAndDelete(objId).exec();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_WAREHOUSE_DELETE',
        resource: 'inventory',
        resourceId: id,
        description: `Deleted unused warehouse "${doc.name}" (${doc.code})`,
        metadata: { code: doc.code },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return {
      success: true,
      message: `Warehouse "${doc.name}" deleted successfully`,
    };
  }
}
