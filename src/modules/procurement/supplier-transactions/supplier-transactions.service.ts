import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Supplier, SupplierDocument } from '../suppliers/schemas/supplier.schema';
import {
  PurchaseOrder,
  PurchaseOrderDocument,
  PurchaseOrderStatus,
} from '../purchase-orders/schemas/purchase-order.schema';
import {
  GoodsReceipt,
  GoodsReceiptDocument,
  GoodsReceiptStatus,
} from '../goods-receipts/schemas/goods-receipt.schema';
import {
  buildPaginationMeta,
  ensureValidObjectId,
} from '../../inventory/common/utils/transaction.util';
import { fromCents, toCents } from '../common/utils/money.util';
import {
  QuerySupplierTransactionsDto,
  SupplierTransactionType,
} from './dto/supplier-transaction.dto';
import { PROCUREMENT_APP_CURRENCY } from '../common/constants/procurement-permissions.constant';

export interface SupplierTransactionEntry {
  id: string;
  transactionType: SupplierTransactionType;
  referenceNumber: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  goodsReceiptId?: string;
  goodsReceiptNumber?: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  warehouseName?: string;
  warehouseCode?: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  commitmentLabel: string;
  notes?: string;
}

const ACCOUNTING_DISCLAIMER =
  'Procurement activity summary only: amounts reflect ordered commitments and received goods values, not verified supplier invoices, payments, or accounts payable balances.';

@Injectable()
export class SupplierTransactionsService {
  constructor(
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(PurchaseOrder.name)
    private readonly poModel: Model<PurchaseOrderDocument>,
    @InjectModel(GoodsReceipt.name)
    private readonly receiptModel: Model<GoodsReceiptDocument>,
  ) {}

  private buildDateMatch(startDate?: string, endDate?: string) {
    if (!startDate && !endDate) return null;
    const range: Record<string, Date> = {};
    if (startDate) range.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      if (/^\d{4}-\d{2}-\d{2}$/.test(endDate.trim())) {
        end.setUTCHours(23, 59, 59, 999);
      }
      range.$lte = end;
    }
    return range;
  }

  private async collectEntries(params: {
    supplierObjId?: Types.ObjectId;
    type?: SupplierTransactionType;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    const dateRange = this.buildDateMatch(params.startDate, params.endDate);
    const poFilter: Record<string, any> = {};
    const grFilter: Record<string, any> = {
      status: GoodsReceiptStatus.CONFIRMED,
    };

    if (params.supplierObjId) {
      poFilter.supplierId = params.supplierObjId;
      grFilter.supplierId = params.supplierObjId;
    }
    if (dateRange) {
      poFilter.orderDate = dateRange;
      grFilter.receivedDate = dateRange;
    }

    const [orders, receipts] = await Promise.all([
      params.type === SupplierTransactionType.GOODS_RECEIPT
        ? []
        : this.poModel
            .find(poFilter)
            .populate({ path: 'supplierId', select: 'name code' })
            .populate({ path: 'destinationWarehouseId', select: 'name code' })
            .lean()
            .exec(),
      params.type === SupplierTransactionType.PURCHASE_ORDER
        ? []
        : this.receiptModel
            .find(grFilter)
            .populate({ path: 'supplierId', select: 'name code' })
            .populate({ path: 'destinationWarehouseId', select: 'name code' })
            .lean()
            .exec(),
    ]);

    const entries: SupplierTransactionEntry[] = [];
    let orderedCents = 0;
    let receivedCents = 0;

    for (const po of orders as any[]) {
      const sup = po.supplierId || {};
      const wh = po.destinationWarehouseId || {};
      if (
        po.status !== PurchaseOrderStatus.CANCELLED &&
        po.status !== PurchaseOrderStatus.DRAFT
      ) {
        orderedCents += toCents(po.grandTotal || 0);
      }

      entries.push({
        id: `po-${po._id}`,
        transactionType: SupplierTransactionType.PURCHASE_ORDER,
        referenceNumber: po.orderNumber,
        purchaseOrderId: String(po._id),
        purchaseOrderNumber: po.orderNumber,
        supplierId: String(sup._id || po.supplierId),
        supplierName: sup.name || po.supplierNameSnapshot || 'Supplier',
        supplierCode: sup.code || po.supplierCodeSnapshot || '',
        warehouseName: wh.name,
        warehouseCode: wh.code,
        date: new Date(po.orderDate || po.createdAt).toISOString(),
        amount: po.grandTotal || 0,
        currency: po.currency || PROCUREMENT_APP_CURRENCY,
        status: po.status,
        commitmentLabel:
          po.status === PurchaseOrderStatus.DRAFT
            ? 'Draft Order Total'
            : po.status === PurchaseOrderStatus.CANCELLED
              ? 'Cancelled Order'
              : 'Purchase Order Commitment',
        notes: po.notes || '',
      });
    }

    for (const gr of receipts as any[]) {
      const sup = gr.supplierId || {};
      const wh = gr.destinationWarehouseId || {};
      receivedCents += toCents(gr.totalReceivedValue || 0);

      entries.push({
        id: `grn-${gr._id}`,
        transactionType: SupplierTransactionType.GOODS_RECEIPT,
        referenceNumber: gr.receiptNumber,
        purchaseOrderId: String(gr.purchaseOrderId),
        purchaseOrderNumber: gr.purchaseOrderNumber,
        goodsReceiptId: String(gr._id),
        goodsReceiptNumber: gr.receiptNumber,
        supplierId: String(sup._id || gr.supplierId),
        supplierName: sup.name || 'Supplier',
        supplierCode: sup.code || '',
        warehouseName: wh.name,
        warehouseCode: wh.code,
        date: new Date(gr.receivedDate || gr.createdAt).toISOString(),
        amount: gr.totalReceivedValue || 0,
        currency: gr.currency || PROCUREMENT_APP_CURRENCY,
        status: gr.status,
        commitmentLabel: 'Confirmed Receipt Value',
        notes: gr.notes || '',
      });
    }

    let filtered = entries;
    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      filtered = entries.filter(
        (e) =>
          e.referenceNumber.toLowerCase().includes(q) ||
          e.purchaseOrderNumber.toLowerCase().includes(q) ||
          e.supplierName.toLowerCase().includes(q) ||
          e.supplierCode.toLowerCase().includes(q),
      );
    }

    filtered.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    const openUnreceivedCents = Math.max(0, orderedCents - receivedCents);

    return {
      entries: filtered,
      summary: {
        currency: PROCUREMENT_APP_CURRENCY,
        totalOrderedCommitment: fromCents(orderedCents),
        totalReceivedGoodsValue: fromCents(receivedCents),
        unreceivedCommitmentAmount: fromCents(openUnreceivedCents),
        transactionCount: filtered.length,
        accountingNote: ACCOUNTING_DISCLAIMER,
      },
    };
  }

  async findAll(query: QuerySupplierTransactionsDto) {
    const supplierObjId = query.supplierId
      ? ensureValidObjectId(query.supplierId, 'supplier')
      : undefined;

    const { entries, summary } = await this.collectEntries({
      supplierObjId,
      type: query.type,
      startDate: query.startDate,
      endDate: query.endDate,
      search: query.search,
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const total = entries.length;
    const start = (page - 1) * limit;
    const data = entries.slice(start, start + limit);

    return {
      data,
      summary,
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async getSupplierStatement(
    supplierId: string,
    query: { startDate?: string; endDate?: string },
  ) {
    const supplierObjId = ensureValidObjectId(supplierId, 'supplier');
    const supplier = await this.supplierModel
      .findById(supplierObjId)
      .lean()
      .exec();
    if (!supplier) {
      throw new NotFoundException('Supplier not found');
    }

    const { entries, summary } = await this.collectEntries({
      supplierObjId,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    return {
      supplier,
      summary,
      transactions: entries,
    };
  }
}
