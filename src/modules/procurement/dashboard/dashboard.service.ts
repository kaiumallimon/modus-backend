import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
import { PROCUREMENT_APP_CURRENCY } from '../common/constants/procurement-permissions.constant';

@Injectable()
export class ProcurementDashboardService {
  constructor(
    @InjectModel(Supplier.name)
    private readonly supplierModel: Model<SupplierDocument>,
    @InjectModel(PurchaseOrder.name)
    private readonly poModel: Model<PurchaseOrderDocument>,
    @InjectModel(GoodsReceipt.name)
    private readonly receiptModel: Model<GoodsReceiptDocument>,
  ) {}

  async getSummary() {
    const [
      totalSuppliers,
      activeSuppliers,
      poStatusCounts,
      confirmedReceiptsCount,
      recentPurchaseOrders,
      recentGoodsReceipts,
    ] = await Promise.all([
      this.supplierModel.countDocuments().exec(),
      this.supplierModel.countDocuments({ isActive: true }).exec(),
      this.poModel.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$grandTotal' },
          },
        },
      ]),
      this.receiptModel
        .countDocuments({ status: GoodsReceiptStatus.CONFIRMED })
        .exec(),
      this.poModel
        .find()
        .populate({ path: 'supplierId', select: 'name code' })
        .populate({ path: 'destinationWarehouseId', select: 'name code' })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean()
        .exec(),
      this.receiptModel
        .find()
        .populate({ path: 'supplierId', select: 'name code' })
        .populate({ path: 'destinationWarehouseId', select: 'name code' })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean()
        .exec(),
    ]);

    const statusMap = new Map<string, { count: number; totalAmount: number }>(
      poStatusCounts.map((s: any) => [
        String(s._id),
        {
          count: Number(s.count || 0),
          totalAmount: Math.round(Number(s.totalAmount || 0) * 100) / 100,
        },
      ]),
    );

    const draftOrders = statusMap.get(PurchaseOrderStatus.DRAFT)?.count ?? 0;
    const orderedOrders = statusMap.get(PurchaseOrderStatus.ORDERED)?.count ?? 0;
    const partiallyReceivedOrders =
      statusMap.get(PurchaseOrderStatus.PARTIALLY_RECEIVED)?.count ?? 0;
    const receivedOrders =
      statusMap.get(PurchaseOrderStatus.RECEIVED)?.count ?? 0;
    const cancelledOrders =
      statusMap.get(PurchaseOrderStatus.CANCELLED)?.count ?? 0;
    const totalPurchaseOrders =
      draftOrders +
      orderedOrders +
      partiallyReceivedOrders +
      receivedOrders +
      cancelledOrders;

    return {
      currency: PROCUREMENT_APP_CURRENCY,
      metrics: {
        totalSuppliers,
        activeSuppliers,
        totalPurchaseOrders,
        draftPurchaseOrders: draftOrders,
        orderedPurchaseOrders: orderedOrders,
        partiallyReceivedPurchaseOrders: partiallyReceivedOrders,
        receivedPurchaseOrders: receivedOrders,
        cancelledPurchaseOrders: cancelledOrders,
        confirmedGoodsReceipts: confirmedReceiptsCount,
      },
      statusBreakdown: [
        {
          status: PurchaseOrderStatus.DRAFT,
          count: draftOrders,
          amount: statusMap.get(PurchaseOrderStatus.DRAFT)?.totalAmount ?? 0,
        },
        {
          status: PurchaseOrderStatus.ORDERED,
          count: orderedOrders,
          amount: statusMap.get(PurchaseOrderStatus.ORDERED)?.totalAmount ?? 0,
        },
        {
          status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
          count: partiallyReceivedOrders,
          amount:
            statusMap.get(PurchaseOrderStatus.PARTIALLY_RECEIVED)
              ?.totalAmount ?? 0,
        },
        {
          status: PurchaseOrderStatus.RECEIVED,
          count: receivedOrders,
          amount:
            statusMap.get(PurchaseOrderStatus.RECEIVED)?.totalAmount ?? 0,
        },
        {
          status: PurchaseOrderStatus.CANCELLED,
          count: cancelledOrders,
          amount:
            statusMap.get(PurchaseOrderStatus.CANCELLED)?.totalAmount ?? 0,
        },
      ],
      recentPurchaseOrders,
      recentGoodsReceipts,
    };
  }
}
