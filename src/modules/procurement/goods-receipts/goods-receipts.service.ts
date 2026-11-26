import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  GoodsReceipt,
  GoodsReceiptDocument,
  GoodsReceiptItem,
  GoodsReceiptStatus,
} from './schemas/goods-receipt.schema';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from '../purchase-orders/schemas/purchase-order.schema';
import { Supplier, SupplierDocument } from '../suppliers/schemas/supplier.schema';
import {
  Product,
  ProductDocument,
} from '../../inventory/products/schemas/product.schema';
import {
  Warehouse,
  WarehouseDocument,
} from '../../inventory/warehouses/schemas/warehouse.schema';
import { StockService } from '../../inventory/stock/stock.service';
import { MovementsService } from '../../inventory/movements/movements.service';
import {
  MovementReferenceType,
  StockMovementType,
} from '../../inventory/movements/schemas/stock-movement.schema';
import { AuditLogService } from '../../audit-log/audit-log.service';
import type { AuditActorMeta } from '../../inventory/categories/categories.service';
import {
  buildPaginationMeta,
  ensureValidObjectId,
  escapeRegex,
  generateReferenceNumber,
  runInTransaction,
} from '../../inventory/common/utils/transaction.util';
import { fromCents, roundQty, toCents } from '../common/utils/money.util';
import {
  ConfirmGoodsReceiptDto,
  CreateGoodsReceiptDto,
  QueryGoodsReceiptDto,
} from './dto/goods-receipt.dto';
import { PROCUREMENT_APP_CURRENCY } from '../common/constants/procurement-permissions.constant';

function computeReceivedNetAmount(
  poItem: PurchaseOrderItem,
  receivedQty: number,
): number {
  if (poItem.orderedQuantity <= 0) return 0;
  const lineTotalCents = toCents(poItem.lineTotal);
  const proportionalCents = Math.round(
    (lineTotalCents * receivedQty) / poItem.orderedQuantity,
  );
  return fromCents(proportionalCents);
}

@Injectable()
export class GoodsReceiptsService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
    @InjectModel(GoodsReceipt.name)
    private readonly receiptModel: Model<GoodsReceiptDocument>,
    @InjectModel(PurchaseOrder.name)
    private readonly poModel: Model<PurchaseOrderDocument>,
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(Warehouse.name)
    private readonly warehouseModel: Model<WarehouseDocument>,
    private readonly stockService: StockService,
    private readonly movementsService: MovementsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(dto: CreateGoodsReceiptDto, audit: AuditActorMeta) {
    const cleanKey = dto.idempotencyKey?.trim() || undefined;
    if (cleanKey) {
      const existing = await this.receiptModel
        .findOne({ idempotencyKey: cleanKey })
        .exec();
      if (existing) {
        return this.findOne(existing._id.toString());
      }
    }

    const poObjId = ensureValidObjectId(dto.purchaseOrderId, 'purchase order');
    const po = await this.poModel.findById(poObjId).exec();
    if (!po) {
      throw new NotFoundException('Purchase order not found');
    }

    if (
      po.status !== PurchaseOrderStatus.ORDERED &&
      po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
    ) {
      throw new BadRequestException(
        `Purchase order "${po.orderNumber}" cannot receive goods in status ${po.status}`,
      );
    }

    const [supplier, warehouse] = await Promise.all([
      this.supplierModel.findById(po.supplierId).exec(),
      this.warehouseModel.findById(po.destinationWarehouseId).exec(),
    ]);
    if (!supplier) {
      throw new NotFoundException('Purchase order supplier no longer exists');
    }
    if (!warehouse || !warehouse.isActive) {
      throw new BadRequestException(
        'Destination warehouse is missing or deactivated',
      );
    }

    const poItemMap = new Map(
      po.items.map((item) => [item.productId.toString(), item]),
    );
    const seenProducts = new Set<string>();
    const receiptItems: GoodsReceiptItem[] = [];
    let totalReceivedUnits = 0;
    let totalReceivedValueCents = 0;

    for (const inputItem of dto.items) {
      const prodObjId = ensureValidObjectId(inputItem.productId, 'product');
      const key = prodObjId.toString();
      if (seenProducts.has(key)) {
        throw new BadRequestException(
          'Duplicate product rows are not allowed in a goods receipt',
        );
      }
      seenProducts.add(key);

      const poItem = poItemMap.get(key);
      if (!poItem) {
        throw new BadRequestException(
          `Product ${key} does not belong to purchase order "${po.orderNumber}"`,
        );
      }

      const prevReceived = roundQty(poItem.receivedQuantity || 0);
      const remainingBefore = roundQty(poItem.orderedQuantity - prevReceived);
      const recvQty = roundQty(inputItem.receivedQuantity);

      if (recvQty <= 0) {
        throw new BadRequestException(
          'Received quantity must be greater than 0',
        );
      }
      if (recvQty > remainingBefore) {
        throw new BadRequestException(
          `Cannot receive ${recvQty} of ${poItem.sku}: only ${remainingBefore} remaining on ${po.orderNumber}`,
        );
      }

      const remainingAfter = roundQty(remainingBefore - recvQty);
      const lineAmount = computeReceivedNetAmount(poItem, recvQty);
      totalReceivedUnits = roundQty(totalReceivedUnits + recvQty);
      totalReceivedValueCents += toCents(lineAmount);

      receiptItems.push({
        productId: poItem.productId,
        productName: poItem.productName,
        sku: poItem.sku,
        unitSymbol: poItem.unitSymbol,
        orderedQuantity: poItem.orderedQuantity,
        previouslyReceivedQuantity: prevReceived,
        receivedQuantity: recvQty,
        remainingQuantity: remainingAfter,
        unitPrice: poItem.unitPrice,
        lineReceivedAmount: lineAmount,
      });
    }

    const receiptNumber = generateReferenceNumber('GRN');
    const receivedDate = dto.receivedDate
      ? new Date(dto.receivedDate)
      : new Date();

    const doc = await this.receiptModel.create({
      receiptNumber,
      idempotencyKey: cleanKey,
      purchaseOrderId: po._id,
      purchaseOrderNumber: po.orderNumber,
      supplierId: po.supplierId,
      destinationWarehouseId: po.destinationWarehouseId,
      receivedDate,
      status: GoodsReceiptStatus.DRAFT,
      items: receiptItems,
      totalReceivedUnits,
      currency: po.currency || PROCUREMENT_APP_CURRENCY,
      totalReceivedValue: fromCents(totalReceivedValueCents),
      notes: dto.notes?.trim() || '',
      createdBy: audit.actor,
    });

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'PROCUREMENT_GRN_CREATE',
      resource: 'procurement',
      resourceId: doc._id.toString(),
      description: `Created draft goods receipt ${doc.receiptNumber} against ${po.orderNumber} (${totalReceivedUnits} units)`,
      metadata: {
        receiptNumber: doc.receiptNumber,
        purchaseOrderId: po._id.toString(),
        purchaseOrderNumber: po.orderNumber,
        totalReceivedUnits,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    if (dto.confirmImmediately) {
      return this.confirm(
        doc._id.toString(),
        { idempotencyKey: cleanKey },
        audit,
      );
    }

    return this.findOne(doc._id.toString());
  }

  async confirm(
    id: string,
    dto: ConfirmGoodsReceiptDto | undefined,
    audit: AuditActorMeta,
  ) {
    const objId = ensureValidObjectId(id, 'goods receipt');
    const appliedDeltas: Array<{
      productId: Types.ObjectId;
      warehouseId: Types.ObjectId;
      delta: number;
    }> = [];
    let poUpdatedSnapshot: {
      poId: Types.ObjectId;
      previousItems: PurchaseOrderItem[];
      previousStatus: PurchaseOrderStatus;
      previousCompletedAt: Date | null | undefined;
    } | null = null;
    let claimedInFallback = false;

    const cleanKey = dto?.idempotencyKey?.trim() || undefined;

    const confirmed = await runInTransaction(
      this.connection,
      async (session?: ClientSession) => {
        const claimFilter: Record<string, any> = {
          _id: objId,
          status: GoodsReceiptStatus.DRAFT,
        };
        const claimed = await this.receiptModel
          .findOneAndUpdate(
            claimFilter,
            {
              $set: {
                status: GoodsReceiptStatus.CONFIRMED,
                confirmedBy: audit.actor,
                confirmedAt: new Date(),
                ...(cleanKey ? { idempotencyKey: cleanKey } : {}),
              },
            },
            {
              new: true,
              ...(session ? { session } : {}),
            },
          )
          .exec();

        if (!claimed) {
          const existingQuery = this.receiptModel.findById(objId);
          if (session) existingQuery.session(session);
          const existing = await existingQuery.exec();
          if (!existing) {
            throw new NotFoundException('Goods receipt not found');
          }
          if (cleanKey && existing.idempotencyKey === cleanKey) {
            return existing;
          }
          throw new ConflictException(
            `Goods receipt "${existing.receiptNumber}" has already been confirmed`,
          );
        }

        claimedInFallback = !session;

        const poQuery = this.poModel.findById(claimed.purchaseOrderId);
        if (session) poQuery.session(session);
        const po = await poQuery.exec();

        if (!po) {
          throw new NotFoundException('Referenced purchase order not found');
        }
        if (
          po.status !== PurchaseOrderStatus.ORDERED &&
          po.status !== PurchaseOrderStatus.PARTIALLY_RECEIVED
        ) {
          throw new BadRequestException(
            `Purchase order "${po.orderNumber}" cannot receive goods in ${po.status} status`,
          );
        }

        const [supplier, warehouse] = await Promise.all([
          this.supplierModel.findById(po.supplierId).exec(),
          this.warehouseModel.findById(po.destinationWarehouseId).exec(),
        ]);

        if (!supplier) {
          throw new NotFoundException('Supplier record missing');
        }
        if (!warehouse || !warehouse.isActive) {
          throw new BadRequestException(
            'Destination warehouse is missing or deactivated',
          );
        }

        const clonePoItem = (item: PurchaseOrderItem): PurchaseOrderItem => ({
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          unitName: item.unitName,
          unitSymbol: item.unitSymbol,
          orderedQuantity: item.orderedQuantity,
          receivedQuantity: item.receivedQuantity,
          unitPrice: item.unitPrice,
          discountType: item.discountType,
          discountValue: item.discountValue,
          discountAmount: item.discountAmount,
          taxType: item.taxType,
          taxValue: item.taxValue,
          taxAmount: item.taxAmount,
          lineSubtotal: item.lineSubtotal,
          lineTotal: item.lineTotal,
        });

        if (!session) {
          poUpdatedSnapshot = {
            poId: po._id,
            previousItems: po.items.map(clonePoItem),
            previousStatus: po.status,
            previousCompletedAt: po.receivedCompletedAt,
          };
        }

        // Deterministic sort by productId to avoid multi-document lock cycles
        const orderedReceiptItems = [...claimed.items].sort((a, b) =>
          a.productId.toString().localeCompare(b.productId.toString()),
        );

        const nextPoItems = po.items.map(clonePoItem);
        const poItemMap = new Map(
          nextPoItems.map((item) => [item.productId.toString(), item]),
        );

        for (const rItem of orderedReceiptItems) {
          const pKey = rItem.productId.toString();
          const product = await this.productModel.findById(rItem.productId).exec();
          if (!product) {
            throw new NotFoundException(`Product ${pKey} no longer exists`);
          }

          const poLine = poItemMap.get(pKey);
          if (!poLine) {
            throw new BadRequestException(
              `Product ${rItem.sku} is no longer present on ${po.orderNumber}`,
            );
          }

          const currentPoReceived = roundQty(poLine.receivedQuantity || 0);
          const remaining = roundQty(poLine.orderedQuantity - currentPoReceived);
          const qtyToApply = roundQty(rItem.receivedQuantity);

          if (qtyToApply <= 0 || qtyToApply > remaining) {
            throw new BadRequestException(
              `Over-receiving blocked for ${rItem.sku}: requested ${qtyToApply}, remaining ${remaining}`,
            );
          }

          poLine.receivedQuantity = roundQty(currentPoReceived + qtyToApply);
          rItem.previouslyReceivedQuantity = currentPoReceived;
          rItem.remainingQuantity = roundQty(
            poLine.orderedQuantity - poLine.receivedQuantity,
          );

          const stockRes = await this.stockService.applyDelta({
            productId: rItem.productId,
            warehouseId: po.destinationWarehouseId,
            delta: qtyToApply,
            session,
          });

          if (!session) {
            appliedDeltas.push({
              productId: rItem.productId,
              warehouseId: po.destinationWarehouseId,
              delta: qtyToApply,
            });
          }

          await this.movementsService.recordMovement(
            {
              productId: rItem.productId,
              warehouseId: po.destinationWarehouseId,
              movementType: StockMovementType.PURCHASE_RECEIPT,
              quantityChange: qtyToApply,
              previousBalance: stockRes.previousQuantity,
              resultingBalance: stockRes.resultingQuantity,
              referenceType: MovementReferenceType.GOODS_RECEIPT,
              referenceId: claimed._id.toString(),
              referenceNumber: claimed.receiptNumber,
              description: `Goods receipt ${claimed.receiptNumber} (${po.orderNumber} from ${supplier.name})`,
              actor: audit.actor,
            },
            session,
          );
        }

        const allReceived = nextPoItems.every(
          (item) => roundQty(item.receivedQuantity) >= roundQty(item.orderedQuantity),
        );
        const nextPoStatus = allReceived
          ? PurchaseOrderStatus.RECEIVED
          : PurchaseOrderStatus.PARTIALLY_RECEIVED;

        po.items = nextPoItems;
        po.status = nextPoStatus;
        if (allReceived) {
          po.receivedCompletedAt = new Date();
        }
        await (session ? po.save({ session }) : po.save());

        claimed.items = claimed.items.map((item) => {
          const match = orderedReceiptItems.find(
            (sortedItem) =>
              sortedItem.productId.toString() === item.productId.toString(),
          );
          return match || item;
        });
        await (session ? claimed.save({ session }) : claimed.save());

        return claimed;
      },
      async () => {
        if (!claimedInFallback) return;
        for (let i = appliedDeltas.length - 1; i >= 0; i--) {
          const applied = appliedDeltas[i];
          await this.stockService
            .applyDelta({
              productId: applied.productId,
              warehouseId: applied.warehouseId,
              delta: -applied.delta,
            })
            .catch(() => undefined);
        }

        await this.movementsService
          .deleteManyByReference(
            MovementReferenceType.GOODS_RECEIPT,
            objId.toString(),
          )
          .catch(() => undefined);

        if (poUpdatedSnapshot) {
          await this.poModel
            .findByIdAndUpdate(poUpdatedSnapshot.poId, {
              $set: {
                items: poUpdatedSnapshot.previousItems,
                status: poUpdatedSnapshot.previousStatus,
                receivedCompletedAt: poUpdatedSnapshot.previousCompletedAt ?? null,
              },
            })
            .catch(() => undefined);
        }

        await this.receiptModel
          .findOneAndUpdate(
            { _id: objId, status: GoodsReceiptStatus.CONFIRMED },
            {
              $set: {
                status: GoodsReceiptStatus.DRAFT,
                confirmedBy: null,
                confirmedAt: null,
              },
            },
          )
          .catch(() => undefined);
      },
    );

    await this.auditLogService.record({
      actor: audit.actor,
      action: 'PROCUREMENT_GRN_CONFIRM',
      resource: 'procurement',
      resourceId: confirmed._id.toString(),
      description: `Confirmed goods receipt ${confirmed.receiptNumber} for ${confirmed.purchaseOrderNumber} (+${confirmed.totalReceivedUnits} units added to inventory)`,
      metadata: {
        receiptNumber: confirmed.receiptNumber,
        purchaseOrderId: confirmed.purchaseOrderId.toString(),
        purchaseOrderNumber: confirmed.purchaseOrderNumber,
        warehouseId: confirmed.destinationWarehouseId.toString(),
        totalReceivedUnits: confirmed.totalReceivedUnits,
        totalReceivedValue: confirmed.totalReceivedValue,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    return this.findOne(id);
  }

  async findAll(query: QueryGoodsReceiptDto) {
    const filter: Record<string, any> = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.purchaseOrderId) {
      filter.purchaseOrderId = ensureValidObjectId(
        query.purchaseOrderId,
        'purchase order',
      );
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
      filter.receivedDate = dateFilter;
    }

    if (query.search && query.search.trim()) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [
        { receiptNumber: regex },
        { purchaseOrderNumber: regex },
        { notes: regex },
        { 'items.sku': regex },
        { 'items.productName': regex },
      ];
    }

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      this.receiptModel.countDocuments(filter).exec(),
      this.receiptModel
        .find(filter)
        .populate({ path: 'supplierId', select: 'name code' })
        .populate({ path: 'destinationWarehouseId', select: 'name code' })
        .populate({
          path: 'purchaseOrderId',
          select: 'orderNumber status grandTotal',
        })
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
    const objId = ensureValidObjectId(id, 'goods receipt');
    const doc = await this.receiptModel
      .findById(objId)
      .populate({
        path: 'supplierId',
        select: 'name code contactPerson email phone',
      })
      .populate({
        path: 'destinationWarehouseId',
        select: 'name code address',
      })
      .populate({
        path: 'purchaseOrderId',
        select: 'orderNumber status orderDate grandTotal currency',
      })
      .lean()
      .exec();

    if (!doc) {
      throw new NotFoundException('Goods receipt not found');
    }

    return doc;
  }
}
