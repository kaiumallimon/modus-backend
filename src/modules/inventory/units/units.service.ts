import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  UnitOfMeasurement,
  UnitOfMeasurementDocument,
} from './schemas/unit-of-measurement.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { CreateUnitDto, QueryUnitDto, UpdateUnitDto } from './dto/unit.dto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import type { AuditActorMeta } from '../categories/categories.service';
import {
  buildPaginationMeta,
  ensureValidObjectId,
  escapeRegex,
} from '../common/utils/transaction.util';

export const DEFAULT_UNITS_SEED = [
  { name: 'Piece', symbol: 'pcs', description: 'Individual discrete item count' },
  { name: 'Kilogram', symbol: 'kg', description: 'Metric weight in kilograms' },
  { name: 'Gram', symbol: 'g', description: 'Metric weight in grams' },
  { name: 'Liter', symbol: 'L', description: 'Metric liquid volume in liters' },
  { name: 'Milliliter', symbol: 'mL', description: 'Metric liquid volume in milliliters' },
  { name: 'Meter', symbol: 'm', description: 'Linear length in meters' },
  { name: 'Box', symbol: 'box', description: 'Standard boxed packaging unit' },
  { name: 'Pack', symbol: 'pack', description: 'Multi-item packaged unit' },
  { name: 'Dozen', symbol: 'doz', description: 'Set of 12 discrete items' },
] as const;

@Injectable()
export class UnitsService {
  private readonly logger = new Logger(UnitsService.name);

  constructor(
    @InjectModel(UnitOfMeasurement.name)
    private readonly unitModel: Model<UnitOfMeasurementDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async seedDefaultUnits(): Promise<void> {
    for (const unitDef of DEFAULT_UNITS_SEED) {
      const normalizedName = unitDef.name.toLowerCase().trim();
      const normalizedSymbol = unitDef.symbol.toLowerCase().trim();

      const exists = await this.unitModel
        .findOne({
          $or: [{ normalizedName }, { normalizedSymbol }],
        })
        .exec();

      if (!exists) {
        try {
          await this.unitModel.create({
            name: unitDef.name,
            normalizedName,
            symbol: unitDef.symbol,
            normalizedSymbol,
            description: unitDef.description,
            isActive: true,
            archivedAt: null,
          });
        } catch (err: any) {
          // Ignore E11000 race on concurrent startup
          if (err?.code !== 11000) {
            throw err;
          }
        }
      }
    }
    this.logger.log('Verified default units of measurement seed');
  }

  private async ensureUniqueNameAndSymbol(
    name?: string,
    symbol?: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const conditions: Record<string, any>[] = [];
    if (name !== undefined) {
      conditions.push({ normalizedName: name.toLowerCase().trim() });
    }
    if (symbol !== undefined) {
      conditions.push({ normalizedSymbol: symbol.toLowerCase().trim() });
    }
    if (conditions.length === 0) return;

    const filter: Record<string, any> = { $or: conditions };
    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    const conflict = await this.unitModel.findOne(filter).exec();
    if (conflict) {
      if (name !== undefined && conflict.normalizedName === name.toLowerCase().trim()) {
        throw new ConflictException(`Unit name "${name.trim()}" already exists`);
      }
      throw new ConflictException(
        `Unit symbol "${symbol?.trim()}" already exists`,
      );
    }
  }

  async create(dto: CreateUnitDto, audit?: AuditActorMeta) {
    const cleanName = dto.name.trim();
    const cleanSymbol = dto.symbol.trim();
    await this.ensureUniqueNameAndSymbol(cleanName, cleanSymbol);

    const isActive = dto.isActive !== undefined ? dto.isActive : true;
    const doc = await this.unitModel.create({
      name: cleanName,
      normalizedName: cleanName.toLowerCase(),
      symbol: cleanSymbol,
      normalizedSymbol: cleanSymbol.toLowerCase(),
      description: dto.description?.trim() || '',
      isActive,
      archivedAt: isActive ? null : new Date(),
    });

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_UNIT_CREATE',
        resource: 'inventory',
        resourceId: doc._id.toString(),
        description: `Created unit of measurement "${doc.name}" (${doc.symbol})`,
        metadata: { name: doc.name, symbol: doc.symbol },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return this.findOne(doc._id.toString());
  }

  async findAll(query: QueryUnitDto) {
    const filter: Record<string, any> = {};
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }
    if (query.search && query.search.trim()) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [{ name: regex }, { symbol: regex }, { description: regex }];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [total, docs] = await Promise.all([
      this.unitModel.countDocuments(filter).exec(),
      this.unitModel
        .find(filter)
        .sort({ isActive: -1, name: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    const unitIds = docs.map((d) => d._id);
    const counts =
      unitIds.length > 0
        ? await this.productModel.aggregate([
            { $match: { unitId: { $in: unitIds } } },
            { $group: { _id: '$unitId', count: { $sum: 1 } } },
          ])
        : [];
    const countMap = new Map(
      counts.map((c: { _id: Types.ObjectId; count: number }) => [
        c._id.toString(),
        c.count,
      ]),
    );

    const data = docs.map((doc) =>
      Object.assign({}, doc.toObject(), {
        productCount: countMap.get(doc._id.toString()) ?? 0,
      }),
    );

    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(id: string) {
    const objId = ensureValidObjectId(id, 'unit');
    const doc = await this.unitModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Unit of measurement not found');
    }
    const productCount = await this.productModel
      .countDocuments({ unitId: objId })
      .exec();
    return Object.assign({}, doc.toObject(), { productCount });
  }

  async update(id: string, dto: UpdateUnitDto, audit?: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'unit');
    const doc = await this.unitModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Unit of measurement not found');
    }

    await this.ensureUniqueNameAndSymbol(dto.name, dto.symbol, objId);

    if (dto.name !== undefined) {
      doc.name = dto.name.trim();
      doc.normalizedName = doc.name.toLowerCase();
    }
    if (dto.symbol !== undefined) {
      doc.symbol = dto.symbol.trim();
      doc.normalizedSymbol = doc.symbol.toLowerCase();
    }
    if (dto.description !== undefined) {
      doc.description = dto.description.trim();
    }
    if (dto.isActive !== undefined) {
      doc.isActive = dto.isActive;
      doc.archivedAt = dto.isActive ? null : new Date();
    }

    await doc.save();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_UNIT_UPDATE',
        resource: 'inventory',
        resourceId: doc._id.toString(),
        description: `Updated unit of measurement "${doc.name}" (${doc.symbol})`,
        metadata: {
          name: doc.name,
          symbol: doc.symbol,
          updatedFields: Object.keys(dto),
          isActive: doc.isActive,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return this.findOne(id);
  }

  async archive(id: string, audit?: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'unit');
    const doc = await this.unitModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Unit of measurement not found');
    }

    doc.isActive = false;
    doc.archivedAt = doc.archivedAt || new Date();
    await doc.save();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_UNIT_ARCHIVE',
        resource: 'inventory',
        resourceId: doc._id.toString(),
        description: `Archived unit "${doc.name}" (${doc.symbol})`,
        metadata: { name: doc.name, symbol: doc.symbol },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return this.findOne(id);
  }

  async remove(id: string, audit?: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'unit');
    const doc = await this.unitModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Unit of measurement not found');
    }

    const referencingProducts = await this.productModel
      .countDocuments({ unitId: objId })
      .exec();
    if (referencingProducts > 0) {
      throw new BadRequestException(
        `Cannot delete unit "${doc.name}" (${doc.symbol}): referenced by ${referencingProducts} product(s). Archive it instead.`,
      );
    }

    await this.unitModel.findByIdAndDelete(objId).exec();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_UNIT_DELETE',
        resource: 'inventory',
        resourceId: id,
        description: `Deleted unused unit "${doc.name}" (${doc.symbol})`,
        metadata: { name: doc.name, symbol: doc.symbol },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return {
      success: true,
      message: `Unit "${doc.name}" deleted successfully`,
    };
  }
}
