import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import type { AuditActorMeta } from '../../inventory/categories/categories.service';
import {
  buildPaginationMeta,
  ensureValidObjectId,
  escapeRegex,
  generateReferenceNumber,
} from '../../inventory/common/utils/transaction.util';
import {
  Product,
  ProductDocument,
} from '../../inventory/products/schemas/product.schema';
import { StockService } from '../../inventory/stock/stock.service';
import {
  Warehouse,
  WarehouseDocument,
} from '../../inventory/warehouses/schemas/warehouse.schema';
import { SALES_APP_CURRENCY } from '../common/constants/sales-permissions.constant';
import {
  computeSalesLinePricing,
  computeSalesOrderTotals,
  roundQty,
  SalesPricingAdjustmentType,
} from '../common/utils/money.util';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import {
  SalesFulfillment,
  SalesFulfillmentDocument,
} from '../fulfillments/schemas/sales-fulfillment.schema';
import {
  CancelSalesOrderDto,
  CreateSalesOrderDto,
  QuerySalesOrderDto,
  SalesOrderItemInputDto,
  UpdateSalesOrderDto,
} from './dto/sales-order.dto';
import {
  SalesOrder,
  SalesOrderDocument,
  SalesOrderItem,
  SalesOrderStatus,
} from './schemas/sales-order.schema';

@Injectable()
export class SalesOrdersService {
  constructor(
    @InjectModel(SalesOrder.name)
    private readonly orderModel: Model<SalesOrderDocument>,
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(Warehouse.name)
    private readonly warehouseModel: Model<WarehouseDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(SalesFulfillment.name)
    private readonly fulfillmentModel: Model<SalesFulfillmentDocument>,
    private readonly stockService: StockService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async resolveOrderLines(
    rawItems: SalesOrderItemInputDto[],
  ): Promise<{
    items: SalesOrderItem[];
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    grandTotal: number;
  }> {
    if (!rawItems.length) {
      throw new BadRequestException(
        'A sales order must contain at least one product line',
      );
    }

    const seenProductIds = new Set<string>();
    const productObjIds: Types.ObjectId[] = [];
    for (const line of rawItems) {
      const pid = ensureValidObjectId(line.productId, 'product');
      const pidStr = pid.toString();
      if (seenProductIds.has(pidStr)) {
        throw new BadRequestException(
          'Duplicate product line items are not allowed in a sales order',
        );
      }
      seenProductIds.add(pidStr);
      productObjIds.push(pid);
    }

    const products = await this.productModel
      .find({ _id: { $in: productObjIds } })
      .populate('unitId', 'name symbol')
      .lean()
      .exec();

    const productMap = new Map(products.map((p) => [p._id.toString(), p]));
    const resolvedItems: SalesOrderItem[] = [];
    const computedLines: ReturnType<typeof computeSalesLinePricing>[] = [];

    for (const line of rawItems) {
      const product = productMap.get(line.productId);
      if (!product) {
        throw new NotFoundException(`Product ${line.productId} not found`);
      }
      if (!product.isActive) {
        throw new BadRequestException(
          `Product '${product.name}' is archived and cannot be added to a sales order`,
        );
      }

      const defaultUnitPrice =
        product.sellingPrice ?? product.costPrice ?? 0;
      const unitPrice =
        line.unitPrice !== undefined ? line.unitPrice : defaultUnitPrice;

      const qty = roundQty(line.orderedQuantity);
      const pricing = computeSalesLinePricing({
        orderedQuantity: qty,
        unitPrice,
        discountType:
          line.discountType ?? SalesPricingAdjustmentType.FIXED,
        discountValue: line.discountValue ?? 0,
        taxType: line.taxType ?? SalesPricingAdjustmentType.FIXED,
        taxValue: line.taxValue ?? 0,
      });

      const unitPop = product.unitId as unknown as
        | { name?: string; symbol?: string }
        | undefined;

      computedLines.push(pricing);
      resolvedItems.push({
        productId: product._id,
        productName: product.name,
        sku: product.sku,
        unitName: unitPop?.name ?? 'Unit',
        unitSymbol: unitPop?.symbol ?? 'unit',
        orderedQuantity: qty,
        fulfilledQuantity: 0,
        unitPrice: pricing.unitPrice,
        discountType: pricing.discountType,
        discountValue: pricing.discountValue,
        discountAmount: pricing.discountAmount,
        taxType: pricing.taxType,
        taxValue: pricing.taxValue,
        taxAmount: pricing.taxAmount,
        lineSubtotal: pricing.lineSubtotal,
        lineTotal: pricing.lineTotal,
      });
    }

    const totals = computeSalesOrderTotals(computedLines);
    return {
      items: resolvedItems,
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      taxTotal: totals.taxTotal,
      grandTotal: totals.grandTotal,
    };
  }

  async create(dto: CreateSalesOrderDto, audit: AuditActorMeta) {
    const customerId = ensureValidObjectId(dto.customerId, 'customer');
    const warehouseId = ensureValidObjectId(dto.warehouseId, 'warehouse');

    const [customer, warehouse] = await Promise.all([
      this.customerModel.findById(customerId).lean().exec(),
      this.warehouseModel.findById(warehouseId).lean().exec(),
    ]);

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    if (!customer.isActive) {
      throw new BadRequestException(
        `Customer '${customer.name}' is archived and cannot be selected for new orders`,
      );
    }
    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }
    if (!warehouse.isActive) {
      throw new BadRequestException(
        `Warehouse '${warehouse.name}' is inactive and cannot fulfill orders`,
      );
    }

    const { items, subtotal, discountTotal, taxTotal, grandTotal } =
      await this.resolveOrderLines(dto.items);

    const orderNumber = generateReferenceNumber('SO');
    const doc = await this.orderModel.create({
      orderNumber,
      customerId: customer._id,
      customerCodeSnapshot: customer.code,
      customerNameSnapshot: customer.name,
      customerPhoneSnapshot: customer.phone,
      customerEmailSnapshot: customer.email ?? null,
      warehouseId: warehouse._id,
      warehouseNameSnapshot: warehouse.name,
      orderDate: dto.orderDate ? new Date(dto.orderDate) : new Date(),
      expectedDeliveryDate: dto.expectedDeliveryDate
        ? new Date(dto.expectedDeliveryDate)
        : null,
      currency: SALES_APP_CURRENCY,
      items,
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      notes: dto.notes?.trim() || '',
      status: SalesOrderStatus.DRAFT,
      createdBy: audit.actor,
      updatedBy: null,
    });

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'SALES_ORDER_CREATE',
      resource: 'sales',
      resourceId: doc._id.toString(),
      description: `Created draft sales order ${doc.orderNumber} for ${customer.name} (${items.length} items, ${SALES_APP_CURRENCY} ${grandTotal.toFixed(2)})`,
      metadata: {
        orderNumber: doc.orderNumber,
        customerId: customer._id.toString(),
        warehouseId: warehouse._id.toString(),
        grandTotal,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(doc._id.toString());
  }

  async findAll(query: QuerySalesOrderDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.customerId) {
      filter.customerId = ensureValidObjectId(query.customerId, 'customer');
    }
    if (query.warehouseId) {
      filter.warehouseId = ensureValidObjectId(query.warehouseId, 'warehouse');
    }
    if (query.startDate || query.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (query.startDate) dateFilter.$gte = new Date(query.startDate);
      if (query.endDate) dateFilter.$lte = new Date(query.endDate);
      filter.orderDate = dateFilter;
    }

    const search = query.search?.trim();
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { orderNumber: regex },
        { customerNameSnapshot: regex },
        { customerCodeSnapshot: regex },
        { warehouseNameSnapshot: regex },
        { notes: regex },
      ];
    }

    const sortField = query.sortBy ?? 'orderDate';
    const sortDir = query.sortOrder === 'asc' ? 1 : -1;

    const [items, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ [sortField]: sortDir, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customerId', 'code name phone email isActive')
        .populate('warehouseId', 'name code isActive')
        .lean()
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(id: string) {
    const objId = ensureValidObjectId(id, 'sales order');
    const order = await this.orderModel
      .findById(objId)
      .populate('customerId', 'code name phone email isActive billingAddress shippingAddress')
      .populate('warehouseId', 'name code address isActive')
      .lean()
      .exec();

    if (!order) {
      throw new NotFoundException('Sales order not found');
    }

    const warehouseRefId =
      typeof order.warehouseId === 'object' && '_id' in order.warehouseId
        ? (order.warehouseId as { _id: Types.ObjectId })._id
        : (order.warehouseId as Types.ObjectId);

    const [stockEntries, fulfillments] = await Promise.all([
      Promise.all(
        order.items.map(async (item) => {
          const available = await this.stockService.getCurrentQuantity(
            item.productId,
            warehouseRefId,
          );
          return [item.productId.toString(), available] as const;
        }),
      ),
      this.fulfillmentModel
        .find({ salesOrderId: order._id })
        .sort({ fulfilledDate: -1, createdAt: -1 })
        .lean()
        .exec(),
    ]);

    const stockMap = new Map(stockEntries);

    return {
      _id: order._id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerCodeSnapshot: order.customerCodeSnapshot,
      customerNameSnapshot: order.customerNameSnapshot,
      customerPhoneSnapshot: order.customerPhoneSnapshot,
      customerEmailSnapshot: order.customerEmailSnapshot,
      warehouseId: order.warehouseId,
      warehouseNameSnapshot: order.warehouseNameSnapshot,
      orderDate: order.orderDate,
      expectedDeliveryDate: order.expectedDeliveryDate ?? null,
      currency: order.currency,
      items: order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        unitName: item.unitName,
        unitSymbol: item.unitSymbol,
        orderedQuantity: item.orderedQuantity,
        fulfilledQuantity: item.fulfilledQuantity,
        remainingQuantity: Math.max(
          0,
          roundQty(item.orderedQuantity - item.fulfilledQuantity),
        ),
        availableStock: stockMap.get(item.productId.toString()) ?? 0,
        unitPrice: item.unitPrice,
        discountType: item.discountType,
        discountValue: item.discountValue,
        discountAmount: item.discountAmount,
        taxType: item.taxType,
        taxValue: item.taxValue,
        taxAmount: item.taxAmount,
        lineSubtotal: item.lineSubtotal,
        lineTotal: item.lineTotal,
      })),
      subtotal: order.subtotal,
      discountTotal: order.discountTotal,
      taxTotal: order.taxTotal,
      grandTotal: order.grandTotal,
      notes: order.notes,
      status: order.status,
      createdBy: order.createdBy,
      updatedBy: order.updatedBy ?? null,
      confirmedBy: order.confirmedBy ?? null,
      confirmedAt: order.confirmedAt ?? null,
      cancelledBy: order.cancelledBy ?? null,
      cancelledAt: order.cancelledAt ?? null,
      cancellationReason: order.cancellationReason ?? null,
      fulfilledCompletedAt: order.fulfilledCompletedAt ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      fulfillments,
    };
  }

  async update(id: string, dto: UpdateSalesOrderDto, audit: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'sales order');
    const existing = await this.orderModel.findById(objId).exec();
    if (!existing) {
      throw new NotFoundException('Sales order not found');
    }
    if (existing.status !== SalesOrderStatus.DRAFT) {
      throw new BadRequestException(
        `Only DRAFT sales orders can be edited (current status: ${existing.status})`,
      );
    }

    if (dto.customerId !== undefined) {
      const custId = ensureValidObjectId(dto.customerId, 'customer');
      const customer = await this.customerModel.findById(custId).lean().exec();
      if (!customer) {
        throw new NotFoundException('Customer not found');
      }
      if (!customer.isActive) {
        throw new BadRequestException(
          `Customer '${customer.name}' is archived and cannot be assigned`,
        );
      }
      existing.customerId = customer._id;
      existing.customerCodeSnapshot = customer.code;
      existing.customerNameSnapshot = customer.name;
      existing.customerPhoneSnapshot = customer.phone;
      existing.customerEmailSnapshot = customer.email ?? null;
    }

    if (dto.warehouseId !== undefined) {
      const whId = ensureValidObjectId(dto.warehouseId, 'warehouse');
      const warehouse = await this.warehouseModel.findById(whId).lean().exec();
      if (!warehouse) {
        throw new NotFoundException('Warehouse not found');
      }
      if (!warehouse.isActive) {
        throw new BadRequestException(
          `Warehouse '${warehouse.name}' is inactive`,
        );
      }
      existing.warehouseId = warehouse._id;
      existing.warehouseNameSnapshot = warehouse.name;
    }

    if (dto.orderDate !== undefined) {
      existing.orderDate = new Date(dto.orderDate);
    }
    if (dto.expectedDeliveryDate !== undefined) {
      existing.expectedDeliveryDate = dto.expectedDeliveryDate
        ? new Date(dto.expectedDeliveryDate)
        : null;
    }
    if (dto.notes !== undefined) {
      existing.notes = dto.notes.trim();
    }

    if (dto.items !== undefined) {
      const resolved = await this.resolveOrderLines(dto.items);
      existing.items = resolved.items;
      existing.subtotal = resolved.subtotal;
      existing.discountTotal = resolved.discountTotal;
      existing.taxTotal = resolved.taxTotal;
      existing.grandTotal = resolved.grandTotal;
    }

    existing.updatedBy = audit.actor;
    await existing.save();

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'SALES_ORDER_UPDATE',
      resource: 'sales',
      resourceId: existing._id.toString(),
      description: `Updated draft sales order ${existing.orderNumber}`,
      metadata: {
        orderNumber: existing.orderNumber,
        grandTotal: existing.grandTotal,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(existing._id.toString());
  }

  async confirm(id: string, audit: AuditActorMeta) {
    const objId = ensureValidObjectId(id, 'sales order');
    const existing = await this.orderModel.findById(objId).exec();
    if (!existing) {
      throw new NotFoundException('Sales order not found');
    }
    if (existing.status !== SalesOrderStatus.DRAFT) {
      throw new BadRequestException(
        `Only DRAFT sales orders can be confirmed (current status: ${existing.status})`,
      );
    }

    const [customer, warehouse] = await Promise.all([
      this.customerModel.findById(existing.customerId).lean().exec(),
      this.warehouseModel.findById(existing.warehouseId).lean().exec(),
    ]);

    if (!customer || !customer.isActive) {
      throw new BadRequestException(
        'Cannot confirm order because the customer is missing or archived',
      );
    }
    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException(
        'Cannot confirm order because the warehouse is missing or inactive',
      );
    }

    const shortages: string[] = [];
    for (const item of existing.items) {
      const available = await this.stockService.getCurrentQuantity(
        item.productId,
        existing.warehouseId,
      );
      if (available < item.orderedQuantity) {
        shortages.push(
          `${item.productName} (${item.sku}): ordered ${item.orderedQuantity}, available ${available}`,
        );
      }
    }

    if (shortages.length > 0) {
      throw new BadRequestException(
        `Insufficient stock in ${warehouse.name} to confirm order: ${shortages.join('; ')}`,
      );
    }

    const now = new Date();
    const updated = await this.orderModel
      .findOneAndUpdate(
        { _id: existing._id, status: SalesOrderStatus.DRAFT },
        {
          $set: {
            status: SalesOrderStatus.CONFIRMED,
            confirmedBy: audit.actor,
            confirmedAt: now,
            updatedBy: audit.actor,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new BadRequestException(
        'Sales order status changed concurrently and could not be confirmed',
      );
    }

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'SALES_ORDER_CONFIRM',
      resource: 'sales',
      resourceId: updated._id.toString(),
      description: `Confirmed sales order ${updated.orderNumber} (${updated.currency} ${updated.grandTotal.toFixed(2)})`,
      metadata: {
        orderNumber: updated.orderNumber,
        warehouseId: updated.warehouseId.toString(),
        grandTotal: updated.grandTotal,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(updated._id.toString());
  }

  async cancel(
    id: string,
    dto: CancelSalesOrderDto | undefined,
    audit: AuditActorMeta,
  ) {
    const objId = ensureValidObjectId(id, 'sales order');
    const existing = await this.orderModel.findById(objId).exec();
    if (!existing) {
      throw new NotFoundException('Sales order not found');
    }

    if (
      existing.status !== SalesOrderStatus.DRAFT &&
      existing.status !== SalesOrderStatus.CONFIRMED
    ) {
      throw new BadRequestException(
        `Cannot cancel sales order with status ${existing.status}`,
      );
    }

    const hasFulfilledItems = existing.items.some(
      (item) => item.fulfilledQuantity > 0,
    );
    if (hasFulfilledItems) {
      throw new BadRequestException(
        'Cannot cancel a sales order that already has fulfilled quantities',
      );
    }

    const now = new Date();
    const updated = await this.orderModel
      .findOneAndUpdate(
        {
          _id: existing._id,
          status: { $in: [SalesOrderStatus.DRAFT, SalesOrderStatus.CONFIRMED] },
        },
        {
          $set: {
            status: SalesOrderStatus.CANCELLED,
            cancelledBy: audit.actor,
            cancelledAt: now,
            cancellationReason: dto?.reason?.trim() || null,
            updatedBy: audit.actor,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updated) {
      throw new BadRequestException(
        'Sales order status changed concurrently and could not be cancelled',
      );
    }

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'SALES_ORDER_CANCEL',
      resource: 'sales',
      resourceId: updated._id.toString(),
      description: `Cancelled sales order ${updated.orderNumber}${dto?.reason ? `: ${dto.reason.trim()}` : ''}`,
      metadata: {
        orderNumber: updated.orderNumber,
        reason: dto?.reason?.trim() || null,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(updated._id.toString());
  }
}
