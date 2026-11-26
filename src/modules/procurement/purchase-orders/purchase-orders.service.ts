import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from './schemas/purchase-order.schema';
import { Supplier, SupplierDocument } from '../suppliers/schemas/supplier.schema';
import {
  Product,
  ProductDocument,
} from '../../inventory/products/schemas/product.schema';
import {
  Warehouse,
  WarehouseDocument,
} from '../../inventory/warehouses/schemas/warehouse.schema';
import {
  GoodsReceipt,
  GoodsReceiptDocument,
  GoodsReceiptStatus,
} from '../goods-receipts/schemas/goods-receipt.schema';
import {
  CancelPurchaseOrderDto,
  CreatePurchaseOrderDto,
  PurchaseOrderItemDto,
  QueryPurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import { AuditLogService } from '../../audit-log/audit-log.service';
import type { AuditActorMeta } from '../../inventory/categories/categories.service';
import {
  buildPaginationMeta,
  ensureValidObjectId,
  escapeRegex,
  generateReferenceNumber,
} from '../../inventory/common/utils/transaction.util';
import {
  PricingAdjustmentType,
  computeLinePricing,
  fromCents,
  roundQty,
  toCents,
} from '../common/utils/money.util';
import { PROCUREMENT_APP_CURRENCY } from '../common/constants/procurement-permissions.constant';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @InjectModel(PurchaseOrder.name)
    private readonly poModel: Model<PurchaseOrderDocument>,
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Warehouse.name)
    private readonly warehouseModel: Model<WarehouseDocument>,
    @InjectModel(GoodsReceipt.name)
    private readonly receiptModel: Model<GoodsReceiptDocument>,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async buildValidatedOrderLines(itemDtos: PurchaseOrderItemDto[]): Promise<{
    items: PurchaseOrderItem[];
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    grandTotal: number;
  }> {
    if (!itemDtos || itemDtos.length === 0) {
      throw new BadRequestException(
        'Purchase order must include at least one product item',
      );
    }

    const seen = new Set<string>();
    const productIds: Types.ObjectId[] = [];
    for (const item of itemDtos) {
      const objId = ensureValidObjectId(item.productId, 'product');
      const key = objId.toString();
      if (seen.has(key)) {
        throw new BadRequestException(
          'Duplicate product lines are not allowed in a single purchase order',
        );
      }
      seen.add(key);
      productIds.push(objId);
    }

    const products = await this.productModel
      .find({ _id: { $in: productIds } })
      .populate({ path: 'unitId', select: 'name symbol' })
      .exec();
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    let subtotalCents = 0;
    let discountCents = 0;
    let taxCents = 0;
    let grandTotalCents = 0;

    const items: PurchaseOrderItem[] = itemDtos.map((dto) => {
      const product = productMap.get(dto.productId);
      if (!product) {
        throw new NotFoundException(`Product ${dto.productId} does not exist`);
      }
      if (!product.isActive) {
        throw new BadRequestException(
          `Product "${product.name}" (${product.sku}) is archived and cannot be ordered`,
        );
      }

      const orderedQuantity = roundQty(dto.orderedQuantity);
      const pricing = computeLinePricing({
        orderedQuantity,
        unitPrice: dto.unitPrice,
        discountType: dto.discountType || PricingAdjustmentType.FIXED,
        discountValue: dto.discountValue ?? 0,
        taxType: dto.taxType || PricingAdjustmentType.FIXED,
        taxValue: dto.taxValue ?? 0,
      });

      subtotalCents += toCents(pricing.lineSubtotal);
      discountCents += toCents(pricing.discountAmount);
      taxCents += toCents(pricing.taxAmount);
      grandTotalCents += toCents(pricing.lineTotal);

      const unitRef = product.unitId as unknown as
        | { name?: string; symbol?: string }
        | undefined;

      return {
        productId: product._id,
        productName: product.name,
        sku: product.sku,
        unitName: unitRef?.name || '',
        unitSymbol: unitRef?.symbol || '',
        orderedQuantity,
        receivedQuantity: 0,
        unitPrice: pricing.unitPrice,
        discountType: pricing.discountType,
        discountValue: pricing.discountValue,
        discountAmount: pricing.discountAmount,
        taxType: pricing.taxType,
        taxValue: pricing.taxValue,
        taxAmount: pricing.taxAmount,
        lineSubtotal: pricing.lineSubtotal,
        lineTotal: pricing.lineTotal,
      };
    });

    return {
      items,
      subtotal: fromCents(subtotalCents),
      discountTotal: fromCents(discountCents),
      taxTotal: fromCents(taxCents),
      grandTotal: fromCents(grandTotalCents),
    };
  }

  private async validateSupplierAndWarehouse(
    supplierId: string,
    warehouseId: string,
  ) {
    const supObjId = ensureValidObjectId(supplierId, 'supplier');
    const whObjId = ensureValidObjectId(warehouseId, 'warehouse');

    const [supplier, warehouse] = await Promise.all([
      this.supplierModel.findById(supObjId).exec(),
      this.warehouseModel.findById(whObjId).exec(),
    ]);

    if (!supplier) {
      throw new NotFoundException('Selected supplier does not exist');
    }
    if (!supplier.isActive) {
      throw new BadRequestException(
        `Supplier "${supplier.name}" is inactive and cannot receive new orders`,
      );
    }

    if (!warehouse) {
      throw new NotFoundException('Destination warehouse does not exist');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException(
        `Warehouse "${warehouse.name}" (${warehouse.code}) is deactivated`,
      );
    }

    return { supplier, warehouse };
  }

  async create(dto: CreatePurchaseOrderDto, audit: AuditActorMeta) {
    const { supplier, warehouse } = await this.validateSupplierAndWarehouse(
      dto.supplierId,
      dto.destinationWarehouseId,
    );

    const computed = await this.buildValidatedOrderLines(dto.items);
    const orderNumber = generateReferenceNumber('PO');
    const orderDate = dto.orderDate ? new Date(dto.orderDate) : new Date();
    const expectedDeliveryDate = dto.expectedDeliveryDate
      ? new Date(dto.expectedDeliveryDate)
      : null;

    const doc = await this.poModel.create({
      orderNumber,
      supplierId: supplier._id,
      supplierNameSnapshot: supplier.name,
      supplierCodeSnapshot: supplier.code,
      destinationWarehouseId: warehouse._id,
      orderDate,
      expectedDeliveryDate,
      currency: PROCUREMENT_APP_CURRENCY,
      items: computed.items,
      subtotal: computed.subtotal,
      discountTotal: computed.discountTotal,
      taxTotal: computed.taxTotal,
      grandTotal: computed.grandTotal,
      status: PurchaseOrderStatus.DRAFT,
      notes: dto.notes?.trim() || '',
      createdBy: audit.actor,
    });

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'PROCUREMENT_PO_CREATE',
      resource: 'procurement',
      resourceId: doc._id.toString(),
      description: `Created draft purchase order ${doc.orderNumber} for supplier "${supplier.name}" (${computed.items.length} line items, ${doc.currency} ${doc.grandTotal.toFixed(2)})`,
      metadata: {
        orderNumber: doc.orderNumber,
        supplierId: supplier._id.toString(),
        supplierCode: supplier.code,
        warehouseId: warehouse._id.toString(),
        grandTotal: doc.grandTotal,
        itemCount: computed.items.length,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(doc._id.toString());
  }

  async findAll(query: QueryPurchaseOrderDto) {
    const filter: Record<string, any> = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.supplierId) {
      filter.supplierId = ensureValidObjectId(query.supplierId, 'supplier');
    }
    if (query.warehouseId) {
      filter.destinationWarehouseId = ensureValidObjectId(
        query.warehouseId,
        'warehouse',
      );
    }

    if (query.startDate || query.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (query.startDate) {
        dateFilter.$gte = new Date(query.startDate);
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        if (/^\d{4}-\d{2}-\d{2}$/.test(query.endDate.trim())) {
          end.setUTCHours(23, 59, 59, 999);
        }
        dateFilter.$lte = end;
      }
      filter.orderDate = dateFilter;
    }

    if (query.search && query.search.trim()) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [
        { orderNumber: regex },
        { supplierNameSnapshot: regex },
        { supplierCodeSnapshot: regex },
        { notes: regex },
        { 'items.sku': regex },
        { 'items.productName': regex },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.poModel.countDocuments(filter).exec(),
      this.poModel
        .find(filter)
        .populate({ path: 'supplierId', select: 'name code email phone isActive' })
        .populate({ path: 'destinationWarehouseId', select: 'name code isActive' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    return {
      data,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(id: string) {
    const objId = ensureValidObjectId(id, 'purchase order');
    const doc = await this.poModel
      .findById(objId)
      .populate({
        path: 'supplierId',
        select: 'name code contactPerson email phone address taxId isActive',
      })
      .populate({
        path: 'destinationWarehouseId',
        select: 'name code address isActive',
      })
      .populate({
        path: 'items.productId',
        select: 'name sku isActive',
      })
      .lean()
      .exec();

    if (!doc) {
      throw new NotFoundException('Purchase order not found');
    }

    const receipts = await this.receiptModel
      .find({ purchaseOrderId: objId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return Object.assign({}, doc, { receipts });
  }

  async update(
    id: string,
    dto: UpdatePurchaseOrderDto,
    audit: AuditActorMeta,
  ) {
    const objId = ensureValidObjectId(id, 'purchase order');
    const doc = await this.poModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Purchase order not found');
    }

    if (doc.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        `Purchase order "${doc.orderNumber}" cannot be edited in ${doc.status} status. Only DRAFT orders are editable.`,
      );
    }

    const nextSupplierId = dto.supplierId || doc.supplierId.toString();
    const nextWarehouseId =
      dto.destinationWarehouseId || doc.destinationWarehouseId.toString();

    const { supplier, warehouse } = await this.validateSupplierAndWarehouse(
      nextSupplierId,
      nextWarehouseId,
    );

    doc.supplierId = supplier._id;
    doc.supplierNameSnapshot = supplier.name;
    doc.supplierCodeSnapshot = supplier.code;
    doc.destinationWarehouseId = warehouse._id;

    if (dto.orderDate !== undefined) {
      doc.orderDate = new Date(dto.orderDate);
    }
    if (dto.expectedDeliveryDate !== undefined) {
      doc.expectedDeliveryDate = dto.expectedDeliveryDate
        ? new Date(dto.expectedDeliveryDate)
        : null;
    }
    if (dto.notes !== undefined) {
      doc.notes = dto.notes?.trim() || '';
    }
    if (dto.items !== undefined) {
      const computed = await this.buildValidatedOrderLines(dto.items);
      doc.items = computed.items;
      doc.subtotal = computed.subtotal;
      doc.discountTotal = computed.discountTotal;
      doc.taxTotal = computed.taxTotal;
      doc.grandTotal = computed.grandTotal;
    }

    await doc.save();

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'PROCUREMENT_PO_UPDATE',
      resource: 'procurement',
      resourceId: doc._id.toString(),
      description: `Updated draft purchase order ${doc.orderNumber}`,
      metadata: {
        orderNumber: doc.orderNumber,
        grandTotal: doc.grandTotal,
        updatedFields: Object.keys(dto),
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(id);
  }

  async submit(id: string, audit: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'purchase order');
    const doc = await this.poModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Purchase order not found');
    }

    if (doc.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(
        `Invalid status transition: "${doc.orderNumber}" is in ${doc.status} status and cannot be submitted`,
      );
    }

    // Re-validate supplier, destination warehouse, and products before submitting
    await this.validateSupplierAndWarehouse(
      doc.supplierId.toString(),
      doc.destinationWarehouseId.toString(),
    );

    const productIds = doc.items.map((i) => i.productId);
    const activeProducts = await this.productModel
      .countDocuments({ _id: { $in: productIds }, isActive: true })
      .exec();
    if (activeProducts !== productIds.length) {
      throw new BadRequestException(
        'One or more ordered products are missing or archived',
      );
    }

    const updated = await this.poModel
      .findOneAndUpdate(
        { _id: objId, status: PurchaseOrderStatus.DRAFT },
        {
          $set: {
            status: PurchaseOrderStatus.ORDERED,
            submittedBy: audit.actor,
            submittedAt: new Date(),
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new ConflictException(
        `Purchase order "${doc.orderNumber}" was already updated by another operation`,
      );
    }

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'PROCUREMENT_PO_SUBMIT',
      resource: 'procurement',
      resourceId: doc._id.toString(),
      description: `Submitted purchase order ${doc.orderNumber} to supplier "${doc.supplierNameSnapshot}"`,
      metadata: {
        orderNumber: doc.orderNumber,
        grandTotal: doc.grandTotal,
        previousStatus: PurchaseOrderStatus.DRAFT,
        nextStatus: PurchaseOrderStatus.ORDERED,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(id);
  }

  async cancel(
    id: string,
    dto: CancelPurchaseOrderDto,
    audit: AuditActorMeta,
  ) {
    const objId = ensureValidObjectId(id, 'purchase order');
    const doc = await this.poModel.findById(objId).exec();
    if (!doc) {
      throw new NotFoundException('Purchase order not found');
    }

    if (
      doc.status !== PurchaseOrderStatus.DRAFT &&
      doc.status !== PurchaseOrderStatus.ORDERED
    ) {
      throw new BadRequestException(
        `Cannot cancel purchase order "${doc.orderNumber}" from status ${doc.status}`,
      );
    }

    const hasReceivedQty = doc.items.some((i) => (i.receivedQuantity || 0) > 0);
    const confirmedReceiptCount = await this.receiptModel
      .countDocuments({
        purchaseOrderId: objId,
        status: GoodsReceiptStatus.CONFIRMED,
      })
      .exec();

    if (hasReceivedQty || confirmedReceiptCount > 0) {
      throw new BadRequestException(
        `Purchase order "${doc.orderNumber}" already has received goods and cannot be cancelled`,
      );
    }

    const updated = await this.poModel
      .findOneAndUpdate(
        {
          _id: objId,
          status: {
            $in: [PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.ORDERED],
          },
        },
        {
          $set: {
            status: PurchaseOrderStatus.CANCELLED,
            cancelledBy: audit.actor,
            cancelledAt: new Date(),
            cancellationReason: dto?.reason?.trim() || '',
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new ConflictException(
        `Purchase order "${doc.orderNumber}" status changed concurrently`,
      );
    }

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'PROCUREMENT_PO_CANCEL',
      resource: 'procurement',
      resourceId: doc._id.toString(),
      description: `Cancelled purchase order ${doc.orderNumber}${dto?.reason ? ` (${dto.reason.trim()})` : ''}`,
      metadata: {
        orderNumber: doc.orderNumber,
        previousStatus: doc.status,
        reason: dto?.reason?.trim() || '',
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(id);
  }
}
