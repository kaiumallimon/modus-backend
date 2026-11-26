import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ensureValidObjectId } from '../../inventory/common/utils/transaction.util';
import { SALES_APP_CURRENCY } from '../common/constants/sales-permissions.constant';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import {
  SalesFulfillment,
  SalesFulfillmentDocument,
} from '../fulfillments/schemas/sales-fulfillment.schema';
import {
  SalesOrder,
  SalesOrderDocument,
  SalesOrderStatus,
} from '../orders/schemas/sales-order.schema';
import { SalesAnalyticsQueryDto } from './dto/sales-analytics-query.dto';

function resolvePeriodBounds(query: SalesAnalyticsQueryDto): {
  startDate: Date;
  endDate: Date;
  days: number;
} {
  const days = query.days ?? 30;
  const endDate = query.endDate ? new Date(query.endDate) : new Date();
  const startDate = query.startDate
    ? new Date(query.startDate)
    : new Date(endDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  return { startDate, endDate, days };
}

@Injectable()
export class SalesDashboardService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
    @InjectModel(SalesOrder.name)
    private readonly orderModel: Model<SalesOrderDocument>,
    @InjectModel(SalesFulfillment.name)
    private readonly fulfillmentModel: Model<SalesFulfillmentDocument>,
  ) {}

  async getOverview(query: SalesAnalyticsQueryDto) {
    const { startDate, endDate, days } = resolvePeriodBounds(query);
    const warehouseObjId: Types.ObjectId | undefined = query.warehouseId
      ? ensureValidObjectId(query.warehouseId, 'warehouse')
      : undefined;

    const orderDateFilter: Record<string, any> = {
      orderDate: { $gte: startDate, $lte: endDate },
    };
    const fulfilledDateFilter: Record<string, any> = {
      fulfilledDate: { $gte: startDate, $lte: endDate },
    };
    if (warehouseObjId) {
      orderDateFilter.warehouseId = warehouseObjId;
      fulfilledDateFilter.warehouseId = warehouseObjId;
    }

    const [
      totalCustomers,
      activeCustomers,
      archivedCustomers,
      orderStatusSummary,
      periodFulfillmentStats,
      trendAgg,
      topProducts,
      recentOrders,
      recentCustomers,
    ] = await Promise.all([
      this.customerModel.countDocuments({}).exec(),
      this.customerModel.countDocuments({ isActive: true }).exec(),
      this.customerModel.countDocuments({ isActive: false }).exec(),
      this.orderModel
        .aggregate<{
          _id: SalesOrderStatus;
          count: number;
          totalValue: number;
        }>([
          { $match: orderDateFilter },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              totalValue: { $sum: '$grandTotal' },
            },
          },
        ])
        .exec(),
      this.fulfillmentModel
        .aggregate<{
          _id: null;
          fulfillmentCount: number;
          fulfilledUnits: number;
          fulfilledRevenue: number;
        }>([
          { $match: fulfilledDateFilter },
          {
            $group: {
              _id: null,
              fulfillmentCount: { $sum: 1 },
              fulfilledUnits: { $sum: '$totalFulfilledUnits' },
              fulfilledRevenue: { $sum: '$totalFulfilledValue' },
            },
          },
        ])
        .exec(),
      this.fulfillmentModel
        .aggregate<{
          _id: string;
          fulfillments: number;
          units: number;
          revenue: number;
        }>([
          { $match: fulfilledDateFilter },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$fulfilledDate' },
              },
              fulfillments: { $sum: 1 },
              units: { $sum: '$totalFulfilledUnits' },
              revenue: { $sum: '$totalFulfilledValue' },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .exec(),
      this.fulfillmentModel
        .aggregate<{
          _id: Types.ObjectId;
          productName: string;
          sku: string;
          unitSymbol: string;
          unitsSold: number;
          revenue: number;
        }>([
          { $match: fulfilledDateFilter },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.productId',
              productName: { $first: '$items.productName' },
              sku: { $first: '$items.sku' },
              unitSymbol: { $first: '$items.unitSymbol' },
              unitsSold: { $sum: '$items.fulfilledQuantity' },
              revenue: { $sum: '$items.lineFulfilledAmount' },
            },
          },
          { $sort: { revenue: -1, unitsSold: -1 } },
          { $limit: 5 },
        ])
        .exec(),
      this.orderModel
        .find(warehouseObjId ? { warehouseId: warehouseObjId } : {})
        .sort({ orderDate: -1, createdAt: -1 })
        .limit(6)
        .select(
          'orderNumber customerNameSnapshot customerCodeSnapshot warehouseNameSnapshot orderDate grandTotal currency status items',
        )
        .lean()
        .exec(),
      this.customerModel
        .find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .select('code name phone email isActive createdAt')
        .lean()
        .exec(),
    ]);

    const statusBuckets: Record<
      SalesOrderStatus,
      { count: number; value: number }
    > = {
      [SalesOrderStatus.DRAFT]: { count: 0, value: 0 },
      [SalesOrderStatus.CONFIRMED]: { count: 0, value: 0 },
      [SalesOrderStatus.PARTIALLY_FULFILLED]: { count: 0, value: 0 },
      [SalesOrderStatus.FULFILLED]: { count: 0, value: 0 },
      [SalesOrderStatus.CANCELLED]: { count: 0, value: 0 },
    };

    for (const row of orderStatusSummary) {
      if (row._id && row._id in statusBuckets) {
        statusBuckets[row._id] = {
          count: row.count,
          value: Math.round(row.totalValue * 100) / 100,
        };
      }
    }

    const totalOrders =
      statusBuckets.DRAFT.count +
      statusBuckets.CONFIRMED.count +
      statusBuckets.PARTIALLY_FULFILLED.count +
      statusBuckets.FULFILLED.count +
      statusBuckets.CANCELLED.count;

    const committedOrdersCount =
      statusBuckets.CONFIRMED.count +
      statusBuckets.PARTIALLY_FULFILLED.count +
      statusBuckets.FULFILLED.count;

    const committedValue =
      Math.round(
        (statusBuckets.CONFIRMED.value +
          statusBuckets.PARTIALLY_FULFILLED.value +
          statusBuckets.FULFILLED.value) *
          100,
      ) / 100;

    const fulfilledStats = periodFulfillmentStats[0];

    return {
      currency: SALES_APP_CURRENCY,
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      summary: {
        totalCustomers,
        activeCustomers,
        archivedCustomers,
        totalOrders,
        draftOrdersCount: statusBuckets.DRAFT.count,
        draftOrdersValue: statusBuckets.DRAFT.value,
        confirmedOrdersCount:
          statusBuckets.CONFIRMED.count +
          statusBuckets.PARTIALLY_FULFILLED.count,
        fulfilledOrdersCount: statusBuckets.FULFILLED.count,
        cancelledOrdersCount: statusBuckets.CANCELLED.count,
        committedOrdersCount,
        committedValue,
        fulfillmentCount: fulfilledStats?.fulfillmentCount ?? 0,
        fulfilledUnits:
          Math.round((fulfilledStats?.fulfilledUnits ?? 0) * 10000) / 10000,
        fulfilledRevenue:
          Math.round((fulfilledStats?.fulfilledRevenue ?? 0) * 100) / 100,
      },
      statusBreakdown: Object.entries(statusBuckets).map(([status, stats]) => ({
        status,
        count: stats.count,
        value: stats.value,
      })),
      dailyTrend: trendAgg.map((t) => ({
        date: t._id,
        fulfillments: t.fulfillments,
        units: Math.round(t.units * 10000) / 10000,
        revenue: Math.round(t.revenue * 100) / 100,
      })),
      topSellingProducts: topProducts.map((p) => ({
        productId: p._id,
        productName: p.productName,
        sku: p.sku,
        unitSymbol: p.unitSymbol,
        unitsSold: Math.round(p.unitsSold * 10000) / 10000,
        revenue: Math.round(p.revenue * 100) / 100,
      })),
      recentOrders: recentOrders.map((o) => ({
        _id: o._id,
        orderNumber: o.orderNumber,
        customerName: o.customerNameSnapshot,
        customerCode: o.customerCodeSnapshot,
        warehouseName: o.warehouseNameSnapshot,
        orderDate: o.orderDate,
        grandTotal: o.grandTotal,
        currency: o.currency,
        status: o.status,
        itemCount: o.items?.length ?? 0,
      })),
      recentCustomers,
    };
  }
}
