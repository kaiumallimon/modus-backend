import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { AuditLogService } from '../../audit-log/audit-log.service';
import type { AuditActorMeta } from '../../inventory/categories/categories.service';
import {
  buildPaginationMeta,
  ensureValidObjectId,
  escapeRegex,
  generateReferenceNumber,
  runInTransaction,
} from '../../inventory/common/utils/transaction.util';
import { MovementsService } from '../../inventory/movements/movements.service';
import {
  MovementReferenceType,
  StockMovementType,
} from '../../inventory/movements/schemas/stock-movement.schema';
import { StockService } from '../../inventory/stock/stock.service';
import {
  Warehouse,
  WarehouseDocument,
} from '../../inventory/warehouses/schemas/warehouse.schema';
import { SALES_APP_CURRENCY } from '../common/constants/sales-permissions.constant';
import {
  computeProportionalLineAmount,
  fromCents,
  roundQty,
  toCents,
} from '../common/utils/money.util';
import {
  SalesOrder,
  SalesOrderDocument,
  SalesOrderItem,
  SalesOrderStatus,
} from '../orders/schemas/sales-order.schema';
import {
  FulfillSalesOrderDto,
  QuerySalesFulfillmentDto,
} from './dto/sales-fulfillment.dto';
import {
  SalesFulfillment,
  SalesFulfillmentDocument,
  SalesFulfillmentItem,
} from './schemas/sales-fulfillment.schema';

function cloneOrderItem(
  item: SalesOrderItem,
  nextFulfilledQuantity?: number,
): SalesOrderItem {
  return {
    productId: item.productId,
    productName: item.productName,
    sku: item.sku,
    unitName: item.unitName,
    unitSymbol: item.unitSymbol,
    orderedQuantity: item.orderedQuantity,
    fulfilledQuantity:
      nextFulfilledQuantity !== undefined
        ? nextFulfilledQuantity
        : item.fulfilledQuantity,
    unitPrice: item.unitPrice,
    discountType: item.discountType,
    discountValue: item.discountValue,
    discountAmount: item.discountAmount,
    taxType: item.taxType,
    taxValue: item.taxValue,
    taxAmount: item.taxAmount,
    lineSubtotal: item.lineSubtotal,
    lineTotal: item.lineTotal,
  };
}

@Injectable()
export class SalesFulfillmentsService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(SalesFulfillment.name)
    private readonly fulfillmentModel: Model<SalesFulfillmentDocument>,
    @InjectModel(SalesOrder.name)
    private readonly orderModel: Model<SalesOrderDocument>,
    @InjectModel(Warehouse.name)
    private readonly warehouseModel: Model<WarehouseDocument>,
    private readonly stockService: StockService,
    private readonly movementsService: MovementsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async fulfillOrder(
    orderId: string,
    dto: FulfillSalesOrderDto,
    audit: AuditActorMeta,
  ) {
    const cleanKey = dto.idempotencyKey?.trim() || undefined;
    if (cleanKey) {
      const existing = await this.fulfillmentModel
        .findOne({ idempotencyKey: cleanKey })
        .exec();
      if (existing) {
        return this.findOne(existing._id.toString());
      }
    }

    const orderObjId = ensureValidObjectId(orderId, 'sales order');

    if (!dto.items.length) {
      throw new BadRequestException(
        'Fulfillment must include at least one item',
      );
    }

    const seenProducts = new Set<string>();
    const requestedMap = new Map<string, number>();
    for (const line of dto.items) {
      const pid = ensureValidObjectId(line.productId, 'product').toString();
      if (seenProducts.has(pid)) {
        throw new BadRequestException(
          'Duplicate product entries in fulfillment payload are not allowed',
        );
      }
      seenProducts.add(pid);
      requestedMap.set(pid, roundQty(line.fulfilledQuantity));
    }

    const initialOrder = await this.orderModel
      .findById(orderObjId)
      .lean()
      .exec();
    if (!initialOrder) {
      throw new NotFoundException('Sales order not found');
    }

    if (
      initialOrder.status !== SalesOrderStatus.CONFIRMED &&
      initialOrder.status !== SalesOrderStatus.PARTIALLY_FULFILLED
    ) {
      throw new BadRequestException(
        `Sales order ${initialOrder.orderNumber} cannot be fulfilled from status ${initialOrder.status}`,
      );
    }

    const warehouse = await this.warehouseModel
      .findById(initialOrder.warehouseId)
      .lean()
      .exec();
    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException(
        'Source warehouse is missing or inactive for fulfillment',
      );
    }

    const fulfillmentId = new Types.ObjectId();
    const fulfillmentNumber = generateReferenceNumber('FUL');
    const fulfilledDate = dto.fulfilledDate
      ? new Date(dto.fulfilledDate)
      : new Date();
    const notes = dto.notes?.trim() || '';

    const appliedDeltas: Array<{
      productId: Types.ObjectId;
      warehouseId: Types.ObjectId;
      delta: number;
    }> = [];
    let previousOrderSnapshot: {
      orderId: Types.ObjectId;
      items: SalesOrderItem[];
      status: SalesOrderStatus;
      fulfilledCompletedAt: Date | null | undefined;
    } | null = null;
    let fulfillmentInsertedInFallback = false;

    const result = await runInTransaction(
      this.connection,
      async (session?: ClientSession) => {
        if (cleanKey) {
          const dupQuery = this.fulfillmentModel.findOne({
            idempotencyKey: cleanKey,
          });
          if (session) dupQuery.session(session);
          const dup = await dupQuery.exec();
          if (dup) {
            return dup;
          }
        }

        const orderQuery = this.orderModel.findOne({
          _id: orderObjId,
          status: {
            $in: [
              SalesOrderStatus.CONFIRMED,
              SalesOrderStatus.PARTIALLY_FULFILLED,
            ],
          },
        });
        if (session) orderQuery.session(session);
        const orderDoc = await orderQuery.exec();

        if (!orderDoc) {
          throw new ConflictException(
            'Sales order is not in a fulfillable state or changed concurrently',
          );
        }

        previousOrderSnapshot = {
          orderId: orderDoc._id,
          items: orderDoc.items.map((it) => cloneOrderItem(it)),
          status: orderDoc.status,
          fulfilledCompletedAt: orderDoc.fulfilledCompletedAt,
        };

        const orderItemByProduct = new Map<string, SalesOrderItem>(
          orderDoc.items.map((it) => [it.productId.toString(), it]),
        );

        const fulfillmentItems: SalesFulfillmentItem[] = [];
        let totalFulfilledUnits = 0;
        let totalFulfilledValueCents = 0;

        for (const [pid, qtyToFulfill] of requestedMap.entries()) {
          const orderItem = orderItemByProduct.get(pid);
          if (!orderItem) {
            throw new BadRequestException(
              `Product ${pid} does not belong to sales order ${orderDoc.orderNumber}`,
            );
          }

          const remaining = Math.max(
            0,
            roundQty(orderItem.orderedQuantity - orderItem.fulfilledQuantity),
          );
          if (qtyToFulfill > remaining) {
            throw new BadRequestException(
              `Fulfill quantity (${qtyToFulfill}) exceeds remaining quantity (${remaining}) for '${orderItem.productName}'`,
            );
          }

          const stockResult = await this.stockService.applyDelta({
            productId: orderItem.productId,
            warehouseId: orderDoc.warehouseId,
            delta: -qtyToFulfill,
            session,
          });

          if (!session) {
            appliedDeltas.push({
              productId: orderItem.productId,
              warehouseId: orderDoc.warehouseId,
              delta: qtyToFulfill,
            });
          }

          await this.movementsService.recordMovement(
            {
              productId: orderItem.productId,
              warehouseId: orderDoc.warehouseId,
              movementType: StockMovementType.SALE_FULFILLMENT,
              quantityChange: -qtyToFulfill,
              previousBalance: stockResult.previousQuantity,
              resultingBalance: stockResult.resultingQuantity,
              referenceType: MovementReferenceType.SALES_FULFILLMENT,
              referenceId: fulfillmentId.toString(),
              referenceNumber: fulfillmentNumber,
              description: notes || `Fulfillment for ${orderDoc.orderNumber}`,
              actor: audit.actor,
            },
            session,
          );

          const remainingAfter = Math.max(
            0,
            roundQty(remaining - qtyToFulfill),
          );
          const lineFulfilledAmount = computeProportionalLineAmount(
            orderItem.orderedQuantity,
            orderItem.lineTotal,
            qtyToFulfill,
          );

          totalFulfilledUnits = roundQty(totalFulfilledUnits + qtyToFulfill);
          totalFulfilledValueCents += toCents(lineFulfilledAmount);

          fulfillmentItems.push({
            productId: orderItem.productId,
            productName: orderItem.productName,
            sku: orderItem.sku,
            unitSymbol: orderItem.unitSymbol,
            orderedQuantity: orderItem.orderedQuantity,
            previouslyFulfilledQuantity: orderItem.fulfilledQuantity,
            fulfilledQuantity: qtyToFulfill,
            remainingQuantity: remainingAfter,
            unitPrice: orderItem.unitPrice,
            lineFulfilledAmount,
          });
        }

        const nextOrderItems = orderDoc.items.map((item) => {
          const addQty = requestedMap.get(item.productId.toString()) ?? 0;
          return cloneOrderItem(
            item,
            roundQty(item.fulfilledQuantity + addQty),
          );
        });

        const allFulfilled = nextOrderItems.every(
          (item) => item.fulfilledQuantity >= item.orderedQuantity,
        );
        const nextOrderStatus = allFulfilled
          ? SalesOrderStatus.FULFILLED
          : SalesOrderStatus.PARTIALLY_FULFILLED;

        const orderUpdateQuery = this.orderModel.findOneAndUpdate(
          {
            _id: orderDoc._id,
            status: orderDoc.status,
          },
          {
            $set: {
              items: nextOrderItems,
              status: nextOrderStatus,
              fulfilledCompletedAt: allFulfilled ? new Date() : null,
              updatedBy: audit.actor,
            },
          },
          { returnDocument: 'after', session },
        );
        const updatedOrder = await orderUpdateQuery.exec();
        if (!updatedOrder) {
          throw new ConflictException(
            'Sales order updated concurrently during fulfillment',
          );
        }

        const payload = {
          _id: fulfillmentId,
          fulfillmentNumber,
          idempotencyKey: cleanKey,
          salesOrderId: orderDoc._id,
          salesOrderNumber: orderDoc.orderNumber,
          customerId: orderDoc.customerId,
          customerCodeSnapshot: orderDoc.customerCodeSnapshot,
          customerNameSnapshot: orderDoc.customerNameSnapshot,
          warehouseId: orderDoc.warehouseId,
          warehouseNameSnapshot: orderDoc.warehouseNameSnapshot,
          fulfilledDate,
          items: fulfillmentItems,
          totalFulfilledUnits,
          currency: orderDoc.currency || SALES_APP_CURRENCY,
          totalFulfilledValue: fromCents(totalFulfilledValueCents),
          notes,
          createdBy: audit.actor,
        };

        let createdFulfillment: SalesFulfillmentDocument;
        if (session) {
          const inserted = await this.fulfillmentModel.create([payload], {
            session,
          });
          createdFulfillment = inserted[0];
        } else {
          createdFulfillment = await this.fulfillmentModel.create(payload);
          fulfillmentInsertedInFallback = true;
        }

        return createdFulfillment;
      },
      async () => {
        for (const rev of appliedDeltas.reverse()) {
          await this.stockService.applyDelta({
            productId: rev.productId,
            warehouseId: rev.warehouseId,
            delta: rev.delta,
          });
        }
        await this.movementsService.deleteManyByReference(
          MovementReferenceType.SALES_FULFILLMENT,
          fulfillmentId.toString(),
        );
        if (previousOrderSnapshot) {
          await this.orderModel
            .findByIdAndUpdate(previousOrderSnapshot.orderId, {
              $set: {
                items: previousOrderSnapshot.items,
                status: previousOrderSnapshot.status,
                fulfilledCompletedAt:
                  previousOrderSnapshot.fulfilledCompletedAt ?? null,
              },
            })
            .exec();
        }
        if (fulfillmentInsertedInFallback) {
          await this.fulfillmentModel
            .findByIdAndDelete(fulfillmentId)
            .exec();
        }
      },
    );

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'SALES_FULFILLMENT_CREATE',
      resource: 'sales',
      resourceId: result._id.toString(),
      description: `Fulfilled ${result.totalFulfilledUnits} units (${result.currency} ${result.totalFulfilledValue.toFixed(2)}) for order ${result.salesOrderNumber} (${result.fulfillmentNumber})`,
      metadata: {
        fulfillmentId: result._id.toString(),
        fulfillmentNumber: result.fulfillmentNumber,
        salesOrderId: result.salesOrderId.toString(),
        salesOrderNumber: result.salesOrderNumber,
        totalFulfilledUnits: result.totalFulfilledUnits,
        totalFulfilledValue: result.totalFulfilledValue,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(result._id.toString());
  }

  async findAll(query: QuerySalesFulfillmentDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};
    if (query.salesOrderId) {
      filter.salesOrderId = ensureValidObjectId(
        query.salesOrderId,
        'sales order',
      );
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
      filter.fulfilledDate = dateFilter;
    }

    const search = query.search?.trim();
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { fulfillmentNumber: regex },
        { salesOrderNumber: regex },
        { customerNameSnapshot: regex },
        { customerCodeSnapshot: regex },
        { warehouseNameSnapshot: regex },
        { notes: regex },
      ];
    }

    const sortField = query.sortBy ?? 'fulfilledDate';
    const sortDir = query.sortOrder === 'asc' ? 1 : -1;

    const [items, total] = await Promise.all([
      this.fulfillmentModel
        .find(filter)
        .sort({ [sortField]: sortDir, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customerId', 'code name phone')
        .populate('warehouseId', 'name code')
        .lean()
        .exec(),
      this.fulfillmentModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      pagination: buildPaginationMeta(total, page, limit),
    };
  }

  async findOne(id: string) {
    const objId = ensureValidObjectId(id, 'sales fulfillment');
    const fulfillment = await this.fulfillmentModel
      .findById(objId)
      .populate('customerId', 'code name phone email')
      .populate('warehouseId', 'name code')
      .populate('salesOrderId', 'orderNumber status grandTotal orderDate')
      .lean()
      .exec();

    if (!fulfillment) {
      throw new NotFoundException('Sales fulfillment not found');
    }

    return fulfillment;
  }
}
