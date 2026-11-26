import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Supplier, SupplierDocument } from './schemas/supplier.schema';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
} from '../purchase-orders/schemas/purchase-order.schema';
import {
  GoodsReceipt,
  GoodsReceiptDocument,
} from '../goods-receipts/schemas/goods-receipt.schema';
import {
  CreateSupplierDto,
  QuerySupplierDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import type { AuditActorMeta } from '../../inventory/categories/categories.service';
import {
  buildPaginationMeta,
  ensureValidObjectId,
  escapeRegex,
} from '../../inventory/common/utils/transaction.util';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(PurchaseOrder.name)
    private readonly purchaseOrderModel: Model<PurchaseOrderDocument>,
    @InjectModel(GoodsReceipt.name)
    private readonly receiptModel: Model<GoodsReceiptDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(dto: CreateSupplierDto, audit?: AuditActorMeta) {
    const code = dto.code.toUpperCase().trim();
    const existing = await this.supplierModel.findOne({ code }).exec();
    if (existing) {
      throw new ConflictException(`Supplier code "${code}" already exists`);
    }

    const isActive = dto.isActive !== undefined ? dto.isActive : true;
    const contacts = (dto.contacts || []).map((c) => ({
      name: c.name.trim(),
      role: c.role?.trim() || '',
      email: c.email?.toLowerCase().trim() || '',
      phone: c.phone?.trim() || '',
      isPrimary: Boolean(c.isPrimary),
    }));

    const doc = await this.supplierModel.create({
      name: dto.name.trim(),
      code,
      contactPerson: dto.contactPerson.trim(),
      email: dto.email.toLowerCase().trim(),
      phone: dto.phone.trim(),
      alternativePhone: dto.alternativePhone?.trim() || '',
      address: dto.address || {},
      website: dto.website?.trim() || '',
      taxId: dto.taxId?.trim() || '',
      notes: dto.notes?.trim() || '',
      contacts,
      isActive,
      deactivatedAt: isActive ? null : new Date(),
    });

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'PROCUREMENT_SUPPLIER_CREATE',
        resource: 'procurement',
        resourceId: doc._id.toString(),
        description: `Registered supplier "${doc.name}" (${doc.code})`,
        metadata: { code: doc.code, name: doc.name, email: doc.email },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return this.findOne(doc._id.toString());
  }

  async findAll(query: QuerySupplierDto) {
    const filter: Record<string, any> = {};
    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    if (query.search && query.search.trim()) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [
        { name: regex },
        { code: regex },
        { contactPerson: regex },
        { email: regex },
        { phone: regex },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      this.supplierModel.countDocuments(filter).exec(),
      this.supplierModel
        .find(filter)
        .sort({ isActive: -1, name: 1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    const supplierIds = items.map((s) => s._id);
    const poAgg = supplierIds.length
      ? await this.purchaseOrderModel.aggregate([
          { $match: { supplierId: { $in: supplierIds } } },
          {
            $group: {
              _id: '$supplierId',
              purchaseOrderCount: { $sum: 1 },
              totalOrderedValue: {
                $sum: {
                  $cond: [{ $ne: ['$status', 'CANCELLED'] }, '$grandTotal', 0],
                },
              },
            },
          },
        ])
      : [];

    const statsMap = new Map(
      poAgg.map((row: any) => [
        String(row._id),
        {
          purchaseOrderCount: row.purchaseOrderCount || 0,
          totalOrderedValue: Math.round((row.totalOrderedValue || 0) * 100) / 100,
        },
      ]),
    );

    const data = items.map((s) => {
      const stats = statsMap.get(String(s._id)) || {
        purchaseOrderCount: 0,
        totalOrderedValue: 0,
      };
      return Object.assign({}, s, {
        purchaseOrderCount: stats.purchaseOrderCount,
        totalOrderedValue: stats.totalOrderedValue,
      });
    });

    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(id: string) {
    const objId = ensureValidObjectId(id, 'supplier');
    const supplier = await this.supplierModel.findById(objId).lean().exec();
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const [recentPurchaseOrders, recentReceipts, poSummary] = await Promise.all([
      this.purchaseOrderModel
        .find({ supplierId: objId })
        .populate({ path: 'destinationWarehouseId', select: 'name code' })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
        .exec(),
      this.receiptModel
        .find({ supplierId: objId })
        .populate({ path: 'destinationWarehouseId', select: 'name code' })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean()
        .exec(),
      this.purchaseOrderModel.aggregate([
        { $match: { supplierId: objId } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            activeOrderedValue: {
              $sum: {
                $cond: [{ $ne: ['$status', 'CANCELLED'] }, '$grandTotal', 0],
              },
            },
          },
        },
      ]),
    ]);

    return Object.assign({}, supplier, {
      purchaseOrderCount: poSummary[0]?.totalOrders || 0,
      totalOrderedValue:
        Math.round((poSummary[0]?.activeOrderedValue || 0) * 100) / 100,
      recentPurchaseOrders,
      recentReceipts,
    });
  }

  async update(id: string, dto: UpdateSupplierDto, audit?: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'supplier');
    const doc = await this.supplierModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Supplier not found');
    }

    if (dto.code !== undefined) {
      const nextCode = dto.code.toUpperCase().trim();
      const dup = await this.supplierModel
        .findOne({ code: nextCode, _id: { $ne: objId } })
        .exec();
      if (dup) {
        throw new ConflictException(`Supplier code "${nextCode}" already exists`);
      }
      doc.code = nextCode;
    }

    if (dto.name !== undefined) doc.name = dto.name.trim();
    if (dto.contactPerson !== undefined) {
      doc.contactPerson = dto.contactPerson.trim();
    }
    if (dto.email !== undefined) doc.email = dto.email.toLowerCase().trim();
    if (dto.phone !== undefined) doc.phone = dto.phone.trim();
    if (dto.alternativePhone !== undefined) {
      doc.alternativePhone = dto.alternativePhone?.trim() || '';
    }
    if (dto.address !== undefined) {
      doc.address = Object.assign(
        {
          street: doc.address?.street || '',
          city: doc.address?.city || '',
          state: doc.address?.state || '',
          postalCode: doc.address?.postalCode || '',
          country: doc.address?.country || '',
        },
        dto.address,
      );
    }
    if (dto.website !== undefined) doc.website = dto.website?.trim() || '';
    if (dto.taxId !== undefined) doc.taxId = dto.taxId?.trim() || '';
    if (dto.notes !== undefined) doc.notes = dto.notes?.trim() || '';
    if (dto.contacts !== undefined) {
      doc.contacts = dto.contacts.map((c) => ({
        name: c.name.trim(),
        role: c.role?.trim() || '',
        email: c.email?.toLowerCase().trim() || '',
        phone: c.phone?.trim() || '',
        isPrimary: Boolean(c.isPrimary),
      }));
    }
    if (dto.isActive !== undefined) {
      doc.isActive = dto.isActive;
      doc.deactivatedAt = dto.isActive ? null : new Date();
    }

    await doc.save();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'PROCUREMENT_SUPPLIER_UPDATE',
        resource: 'procurement',
        resourceId: doc._id.toString(),
        description: `Updated supplier "${doc.name}" (${doc.code})`,
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
    const objId = ensureValidObjectId(id, 'supplier');
    const doc = await this.supplierModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Supplier not found');
    }

    if (!doc.isActive) {
      return this.findOne(id);
    }

    doc.isActive = false;
    doc.deactivatedAt = new Date();
    await doc.save();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'PROCUREMENT_SUPPLIER_DEACTIVATE',
        resource: 'procurement',
        resourceId: doc._id.toString(),
        description: `Deactivated supplier "${doc.name}" (${doc.code})`,
        metadata: { code: doc.code },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return this.findOne(id);
  }

  async remove(id: string, audit?: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'supplier');
    const doc = await this.supplierModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Supplier not found');
    }

    const [poRefs, receiptRefs] = await Promise.all([
      this.purchaseOrderModel.countDocuments({ supplierId: objId }).exec(),
      this.receiptModel.countDocuments({ supplierId: objId }).exec(),
    ]);

    if (poRefs > 0 || receiptRefs > 0) {
      throw new BadRequestException(
        'Cannot hard-delete a supplier referenced by purchase orders or goods receipts. Deactivate the supplier instead.',
      );
    }

    await this.supplierModel.deleteOne({ _id: objId }).exec();

    if (audit) {
      await this.auditLogService.record({
        actor: audit.actor,
        action: 'PROCUREMENT_SUPPLIER_DELETE',
        resource: 'procurement',
        resourceId: id,
        description: `Deleted unused supplier "${doc.name}" (${doc.code})`,
        metadata: { code: doc.code },
        ipAddress: audit.ipAddress,
        userAgent: audit.userAgent,
      });
    }

    return { deleted: true, id };
  }
}
