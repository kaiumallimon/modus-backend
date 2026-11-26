import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ProductCategory,
  ProductCategoryDocument,
} from './schemas/product-category.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import {
  CreateCategoryDto,
  QueryCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import {
  buildPaginationMeta,
  ensureValidObjectId,
  escapeRegex,
} from '../common/utils/transaction.util';

export interface AuditActorMeta {
  actor: { id: string; email: string; humanId?: string; role?: string };
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(ProductCategory.name)
    private readonly categoryModel: Model<ProductCategoryDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async validateParentCategory(
    parentId: string,
    selfId?: Types.ObjectId,
  ): Promise<Types.ObjectId> {
    const parentObjId = ensureValidObjectId(parentId, 'parent category');
    if (selfId && parentObjId.equals(selfId)) {
      throw new BadRequestException('A category cannot be its own parent');
    }

    const parent = await this.categoryModel.findById(parentObjId).exec();
    if (!parent) {
      throw new BadRequestException('Parent category not found');
    }

    // Walk ancestors to prevent parent cycles
    let cursor = parent.parentCategoryId;
    let depth = 0;
    while (cursor && depth < 15) {
      if (selfId && cursor.equals(selfId)) {
        throw new BadRequestException(
          'Invalid hierarchy: circular parent category reference detected',
        );
      }
      const next = await this.categoryModel
        .findById(cursor)
        .select('parentCategoryId')
        .exec();
      cursor = next?.parentCategoryId ?? null;
      depth++;
    }

    return parentObjId;
  }

  async create(dto: CreateCategoryDto, audit?: AuditActorMeta) {
    const cleanName = dto.name.trim();
    const normalizedName = cleanName.toLowerCase();

    const duplicate = await this.categoryModel
      .findOne({ normalizedName })
      .exec();
    if (duplicate) {
      throw new ConflictException(`Category "${cleanName}" already exists`);
    }

    let parentCategoryId: Types.ObjectId | null = null;
    if (dto.parentCategoryId) {
      parentCategoryId = await this.validateParentCategory(
        dto.parentCategoryId,
      );
    }

    const isActive = dto.isActive !== undefined ? dto.isActive : true;
    const doc = await this.categoryModel.create({
      name: cleanName,
      normalizedName,
      description: dto.description?.trim() || '',
      parentCategoryId,
      isActive,
      archivedAt: isActive ? null : new Date(),
    });

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_CATEGORY_CREATE',
        resource: 'inventory',
        resourceId: doc._id.toString(),
        description: `Created product category "${doc.name}"`,
        metadata: { categoryName: doc.name, isActive: doc.isActive },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return this.findOne(doc._id.toString());
  }

  async findAll(query: QueryCategoryDto) {
    const filter: Record<string, any> = {};

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    if (query.parentCategoryId) {
      filter.parentCategoryId = ensureValidObjectId(
        query.parentCategoryId,
        'parent category',
      );
    }

    if (query.search && query.search.trim()) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [{ name: regex }, { description: regex }];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [total, docs] = await Promise.all([
      this.categoryModel.countDocuments(filter).exec(),
      this.categoryModel
        .find(filter)
        .populate('parentCategoryId', 'name isActive')
        .sort({ isActive: -1, name: 1 })
        .skip(skip)
        .limit(limit)
        .exec(),
    ]);

    const categoryIds = docs.map((d) => d._id);
    const counts =
      categoryIds.length > 0
        ? await this.productModel.aggregate([
            { $match: { categoryId: { $in: categoryIds } } },
            { $group: { _id: '$categoryId', count: { $sum: 1 } } },
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
    const objId = ensureValidObjectId(id, 'category');
    const doc = await this.categoryModel
      .findById(objId)
      .populate('parentCategoryId', 'name isActive')
      .exec();
    if (!doc) {
      throw new NotFoundException('Product category not found');
    }
    const productCount = await this.productModel
      .countDocuments({ categoryId: objId })
      .exec();
    return Object.assign({}, doc.toObject(), { productCount });
  }

  async update(id: string, dto: UpdateCategoryDto, audit?: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'category');
    const doc = await this.categoryModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Product category not found');
    }

    if (dto.name !== undefined) {
      const cleanName = dto.name.trim();
      const normalizedName = cleanName.toLowerCase();
      const duplicate = await this.categoryModel
        .findOne({ normalizedName, _id: { $ne: objId } })
        .exec();
      if (duplicate) {
        throw new ConflictException(`Category "${cleanName}" already exists`);
      }
      doc.name = cleanName;
      doc.normalizedName = normalizedName;
    }

    if (dto.description !== undefined) {
      doc.description = dto.description.trim();
    }

    if (dto.parentCategoryId !== undefined) {
      doc.parentCategoryId = dto.parentCategoryId
        ? await this.validateParentCategory(dto.parentCategoryId, objId)
        : null;
    }

    if (dto.isActive !== undefined) {
      doc.isActive = dto.isActive;
      doc.archivedAt = dto.isActive ? null : new Date();
    }

    await doc.save();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_CATEGORY_UPDATE',
        resource: 'inventory',
        resourceId: doc._id.toString(),
        description: `Updated product category "${doc.name}"`,
        metadata: {
          categoryName: doc.name,
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
    const objId = ensureValidObjectId(id, 'category');
    const doc = await this.categoryModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Product category not found');
    }

    doc.isActive = false;
    doc.archivedAt = doc.archivedAt || new Date();
    await doc.save();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_CATEGORY_ARCHIVE',
        resource: 'inventory',
        resourceId: doc._id.toString(),
        description: `Archived product category "${doc.name}"`,
        metadata: { categoryName: doc.name },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return this.findOne(id);
  }

  async remove(id: string, audit?: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'category');
    const doc = await this.categoryModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Product category not found');
    }

    const [dependentProducts, dependentChildren] = await Promise.all([
      this.productModel.countDocuments({ categoryId: objId }).exec(),
      this.categoryModel.countDocuments({ parentCategoryId: objId }).exec(),
    ]);

    if (dependentProducts > 0 || dependentChildren > 0) {
      throw new BadRequestException(
        `Cannot delete category "${doc.name}": referenced by ${dependentProducts} product(s) and ${dependentChildren} sub-category(ies). Archive it instead.`,
      );
    }

    await this.categoryModel.findByIdAndDelete(objId).exec();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'INVENTORY_CATEGORY_DELETE',
        resource: 'inventory',
        resourceId: id,
        description: `Deleted unused product category "${doc.name}"`,
        metadata: { categoryName: doc.name },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return {
      success: true,
      message: `Category "${doc.name}" deleted successfully`,
    };
  }
}
