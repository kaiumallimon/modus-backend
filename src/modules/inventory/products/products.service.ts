import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import 'multer';
import { Product, ProductDocument } from './schemas/product.schema';
import {
  ProductCategory,
  ProductCategoryDocument,
} from '../categories/schemas/product-category.schema';
import {
  UnitOfMeasurement,
  UnitOfMeasurementDocument,
} from '../units/schemas/unit-of-measurement.schema';
import {
  StockBalance,
  StockBalanceDocument,
} from '../stock/schemas/stock-balance.schema';
import {
  StockMovement,
  StockMovementDocument,
} from '../movements/schemas/stock-movement.schema';
import {
  CreateProductDto,
  QueryProductDto,
  UpdateProductDto,
} from './dto/product.dto';
import { StorageService } from '../../storage/storage.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import type { AuditActorMeta } from '../categories/categories.service';
import {
  buildPaginationMeta,
  ensureValidObjectId,
  escapeRegex,
} from '../common/utils/transaction.util';

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(ProductCategory.name)
    private readonly categoryModel: Model<ProductCategoryDocument>,
    @InjectModel(UnitOfMeasurement.name)
    private readonly unitModel: Model<UnitOfMeasurementDocument>,
    @InjectModel(StockBalance.name)
    private readonly balanceModel: Model<StockBalanceDocument>,
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovementDocument>,
    private readonly storageService: StorageService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async validateCategoryAndUnit(
    categoryId?: string,
    unitId?: string,
  ): Promise<{ categoryObjId?: Types.ObjectId; unitObjId?: Types.ObjectId }> {
    let categoryObjId: Types.ObjectId | undefined;
    let unitObjId: Types.ObjectId | undefined;

    if (categoryId !== undefined) {
      categoryObjId = ensureValidObjectId(categoryId, 'category');
      const category = await this.categoryModel.findById(categoryObjId).exec();
      if (!category) {
        throw new BadRequestException('Selected product category does not exist');
      }
      if (!category.isActive) {
        throw new BadRequestException(
          `Category "${category.name}" is archived and cannot be assigned`,
        );
      }
    }

    if (unitId !== undefined) {
      unitObjId = ensureValidObjectId(unitId, 'unit');
      const unit = await this.unitModel.findById(unitObjId).exec();
      if (!unit) {
        throw new BadRequestException('Selected unit of measurement does not exist');
      }
      if (!unit.isActive) {
        throw new BadRequestException(
          `Unit "${unit.name}" (${unit.symbol}) is archived and cannot be assigned`,
        );
      }
    }

    return { categoryObjId, unitObjId };
  }

  private async ensureUniqueSkuAndBarcode(
    sku?: string,
    barcode?: string,
    excludeId?: Types.ObjectId,
  ) {
    if (sku !== undefined) {
      const normalizedSku = sku.toUpperCase().trim();
      const filter: Record<string, any> = { sku: normalizedSku };
      if (excludeId) filter._id = { $ne: excludeId };
      const existingSku = await this.productModel.findOne(filter).exec();
      if (existingSku) {
        throw new ConflictException(`Product SKU "${normalizedSku}" already exists`);
      }
    }

    if (barcode !== undefined && barcode.trim()) {
      const normalizedBarcode = barcode.trim();
      const filter: Record<string, any> = { barcode: normalizedBarcode };
      if (excludeId) filter._id = { $ne: excludeId };
      const existingBarcode = await this.productModel.findOne(filter).exec();
      if (existingBarcode) {
        throw new ConflictException(
          `Product barcode "${normalizedBarcode}" is already assigned to SKU "${existingBarcode.sku}"`,
        );
      }
    }
  }

  async create(dto: CreateProductDto, audit?: AuditActorMeta) {
    const sku = dto.sku.toUpperCase().trim();
    const barcode = dto.barcode?.trim() || undefined;

    await this.ensureUniqueSkuAndBarcode(sku, barcode);
    const { categoryObjId, unitObjId } = await this.validateCategoryAndUnit(
      dto.categoryId,
      dto.unitId,
    );

    const isActive = dto.isActive !== undefined ? dto.isActive : true;
    const doc = await this.productModel.create({
      name: dto.name.trim(),
      sku,
      ...(barcode ? { barcode } : {}),
      description: dto.description?.trim() || '',
      categoryId: categoryObjId!,
      unitId: unitObjId!,
      costPrice: dto.costPrice,
      sellingPrice: dto.sellingPrice ?? null,
      minStockThreshold: dto.minStockThreshold ?? 0,
      imageUrl: dto.imageUrl?.trim() || null,
      imageKey: dto.imageKey?.trim() || null,
      isActive,
      archivedAt: isActive ? null : new Date(),
    });

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_PRODUCT_CREATE',
        resource: 'inventory',
        resourceId: doc._id.toString(),
        description: `Created product "${doc.name}" (${doc.sku})`,
        metadata: { sku: doc.sku, name: doc.name, costPrice: doc.costPrice },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return this.findOne(doc._id.toString());
  }

  async findAll(query: QueryProductDto) {
    const filter: Record<string, any> = {};

    if (query.categoryId) {
      filter.categoryId = ensureValidObjectId(query.categoryId, 'category');
    }
    if (query.unitId) {
      filter.unitId = ensureValidObjectId(query.unitId, 'unit');
    }
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }
    if (query.search && query.search.trim()) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [
        { name: regex },
        { sku: regex },
        { barcode: regex },
        { description: regex },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const allowedSortFields = new Set([
      'name',
      'sku',
      'costPrice',
      'sellingPrice',
      'minStockThreshold',
      'createdAt',
      'updatedAt',
    ]);
    const sortField =
      query.sortBy && allowedSortFields.has(query.sortBy)
        ? query.sortBy
        : 'createdAt';
    const sortDir = query.sortOrder === 'asc' ? 1 : -1;

    const [total, docs] = await Promise.all([
      this.productModel.countDocuments(filter).exec(),
      this.productModel
        .find(filter)
        .populate('categoryId', 'name isActive')
        .populate('unitId', 'name symbol isActive')
        .sort({ [sortField]: sortDir, _id: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    const productIds = docs.map((d) => d._id);
    const totalsAgg =
      productIds.length > 0
        ? await this.balanceModel.aggregate([
            { $match: { productId: { $in: productIds } } },
            {
              $group: {
                _id: '$productId',
                totalStock: { $sum: '$quantity' },
                warehouseCount: {
                  $sum: { $cond: [{ $gt: ['$quantity', 0] }, 1, 0] },
                },
              },
            },
          ])
        : [];

    const stockMap = new Map(
      totalsAgg.map(
        (row: {
          _id: Types.ObjectId;
          totalStock: number;
          warehouseCount: number;
        }) => [row._id.toString(), row],
      ),
    );

    const data = docs.map((doc) => {
      const summary = stockMap.get(doc._id.toString());
      return Object.assign({}, doc.toObject(), {
        totalStock: summary?.totalStock ?? 0,
        warehouseCount: summary?.warehouseCount ?? 0,
      });
    });

    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(id: string) {
    const objId = ensureValidObjectId(id, 'product');
    const doc = await this.productModel
      .findById(objId)
      .populate('categoryId', 'name description isActive')
      .populate('unitId', 'name symbol isActive')
      .exec();

    if (!doc) {
      throw new NotFoundException('Product not found');
    }

    const [balances, recentMovements] = await Promise.all([
      this.balanceModel
        .find({ productId: objId })
        .populate('warehouseId', 'name code isActive')
        .sort({ quantity: -1 })
        .exec(),
      this.movementModel
        .find({ productId: objId })
        .populate('warehouseId', 'name code')
        .sort({ createdAt: -1 })
        .limit(10)
        .exec(),
    ]);

    const totalStock = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);

    return Object.assign({}, doc.toObject(), {
      totalStock,
      warehouseCount: balances.filter((b) => b.quantity > 0).length,
      warehouseBalances: balances,
      recentMovements,
    });
  }

  async update(id: string, dto: UpdateProductDto, audit?: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'product');
    const doc = await this.productModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Product not found');
    }

    const nextSku = dto.sku !== undefined ? dto.sku.toUpperCase().trim() : undefined;
    const nextBarcode =
      dto.barcode !== undefined ? dto.barcode?.trim() || '' : undefined;

    await this.ensureUniqueSkuAndBarcode(
      nextSku,
      nextBarcode || undefined,
      objId,
    );

    const { categoryObjId, unitObjId } = await this.validateCategoryAndUnit(
      dto.categoryId,
      dto.unitId,
    );

    if (dto.name !== undefined) doc.name = dto.name.trim();
    if (nextSku !== undefined) doc.sku = nextSku;
    if (dto.barcode !== undefined) {
      doc.barcode = nextBarcode || undefined;
    }
    if (dto.description !== undefined) doc.description = dto.description.trim();
    if (categoryObjId !== undefined) doc.categoryId = categoryObjId;
    if (unitObjId !== undefined) doc.unitId = unitObjId;
    if (dto.costPrice !== undefined) doc.costPrice = dto.costPrice;
    if (dto.sellingPrice !== undefined) doc.sellingPrice = dto.sellingPrice;
    if (dto.minStockThreshold !== undefined) {
      doc.minStockThreshold = dto.minStockThreshold;
    }
    if (dto.imageUrl !== undefined) {
      doc.imageUrl = dto.imageUrl?.trim() || null;
    }
    if (dto.imageKey !== undefined) {
      doc.imageKey = dto.imageKey?.trim() || null;
    }
    if (dto.isActive !== undefined) {
      doc.isActive = dto.isActive;
      doc.archivedAt = dto.isActive ? null : new Date();
    }

    await doc.save();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_PRODUCT_UPDATE',
        resource: 'inventory',
        resourceId: doc._id.toString(),
        description: `Updated product "${doc.name}" (${doc.sku})`,
        metadata: {
          sku: doc.sku,
          updatedFields: Object.keys(dto),
          isActive: doc.isActive,
        },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return this.findOne(id);
  }

  async uploadImage(
    id: string,
    file: Express.Multer.File,
    audit?: AuditActorMeta,
  ) {
    const objId = ensureValidObjectId(id, 'product');
    const doc = await this.productModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Product not found');
    }

    if (!file) {
      throw new BadRequestException('No image file provided');
    }
    if (!ALLOWED_IMAGE_MIMES.has(file.mimetype)) {
      throw new BadRequestException(
        `Invalid image format "${file.mimetype}". Only JPEG, PNG, WEBP, and GIF are allowed`,
      );
    }
    if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
      throw new BadRequestException('Product image size cannot exceed 5MB');
    }

    const uploaded = await this.storageService.uploadAsset(file, 'products');
    if (doc.imageKey) {
      await this.storageService.deleteObjects([doc.imageKey]);
    }

    doc.imageUrl = uploaded.url;
    doc.imageKey = uploaded.key;
    await doc.save();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_PRODUCT_UPDATE',
        resource: 'inventory',
        resourceId: doc._id.toString(),
        description: `Uploaded image for product "${doc.name}" (${doc.sku})`,
        metadata: { sku: doc.sku, imageKey: uploaded.key },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return this.findOne(id);
  }

  async archive(id: string, audit?: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'product');
    const doc = await this.productModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Product not found');
    }

    doc.isActive = false;
    doc.archivedAt = doc.archivedAt || new Date();
    await doc.save();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_PRODUCT_ARCHIVE',
        resource: 'inventory',
        resourceId: doc._id.toString(),
        description: `Archived product "${doc.name}" (${doc.sku})`,
        metadata: { sku: doc.sku, name: doc.name },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return this.findOne(id);
  }

  async remove(id: string, audit?: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'product');
    const doc = await this.productModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Product not found');
    }

    const [hasBalances, hasMovements] = await Promise.all([
      this.balanceModel.countDocuments({ productId: objId }).exec(),
      this.movementModel.countDocuments({ productId: objId }).exec(),
    ]);

    if (hasBalances > 0 || hasMovements > 0) {
      return this.archive(id, audit);
    }

    if (doc.imageKey) {
      await this.storageService.deleteObjects([doc.imageKey]);
    }
    await this.productModel.findByIdAndDelete(objId).exec();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_PRODUCT_ARCHIVE',
        resource: 'inventory',
        resourceId: id,
        description: `Deleted unused product "${doc.name}" (${doc.sku})`,
        metadata: { sku: doc.sku, name: doc.name },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return {
      success: true,
      archived: false,
      deleted: true,
      message: `Product "${doc.name}" (${doc.sku}) deleted successfully`,
    };
  }
}
