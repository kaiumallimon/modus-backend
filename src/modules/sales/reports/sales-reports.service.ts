import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ensureValidObjectId } from '../../inventory/common/utils/transaction.util';
import { SALES_APP_CURRENCY } from '../common/constants/sales-permissions.constant';
import { SalesAnalyticsQueryDto } from '../dashboard/dto/sales-analytics-query.dto';
import {
  SalesFulfillment,
  SalesFulfillmentDocument,
} from '../fulfillments/schemas/sales-fulfillment.schema';
import {
  SalesOrder,
  SalesOrderDocument,
  SalesOrderStatus,
} from '../orders/schemas/sales-order.schema';

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
export class SalesReportsService {
  constructor(
    @InjectModel(SalesOrder.name)
    private readonly orderModel: Model<SalesOrderDocument>,
    @InjectModel(SalesFulfillment.name)
    private readonly fulfillmentModel: Model<SalesFulfillmentDocument>,
  ) {}

  async getSummary(query: SalesAnalyticsQueryDto) {
    const { startDate, endDate, days } = resolvePeriodBounds(query);
    const warehouseObjId: Types.ObjectId | undefined = query.warehouseId
      ? ensureValidObjectId(query.warehouseId, 'warehouse')
      : undefined;

    const orderMatch: Record<string, any> = {
      orderDate: { $gte: startDate, $lte: endDate },
    };
    const fulfillmentMatch: Record<string, any> = {
      fulfilledDate: { $gte: startDate, $lte: endDate },
    };
    if (warehouseObjId) {
      orderMatch.warehouseId = warehouseObjId;
      fulfillmentMatch.warehouseId = warehouseObjId;
    }

    const [ordersByStatus, fulfillmentSummary, topCustomers, dailyFulfillments] =
      await Promise.all([
        this.orderModel
          .aggregate<{
            _id: SalesOrderStatus;
            count: number;
            orderValue: number;
          }>([
            { $match: orderMatch },
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 },
                orderValue: { $sum: '$grandTotal' },
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
            { $match: fulfillmentMatch },
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
            _id: Types.ObjectId;
            customerName: string;
            customerCode: string;
            fulfillments: number;
            units: number;
            revenue: number;
          }>([
            { $match: fulfillmentMatch },
            {
              $group: {
                _id: '$customerId',
                customerName: { $first: '$customerNameSnapshot' },
                customerCode: { $first: '$customerCodeSnapshot' },
                fulfillments: { $sum: 1 },
                units: { $sum: '$totalFulfilledUnits' },
                revenue: { $sum: '$totalFulfilledValue' },
              },
            },
            { $sort: { revenue: -1 } },
            { $limit: query.limit ?? 10 },
          ])
          .exec(),
        this.fulfillmentModel
          .aggregate<{
            _id: string;
            fulfillments: number;
            units: number;
            revenue: number;
          }>([
            { $match: fulfillmentMatch },
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
      ]);

    const fulfilledAgg = fulfillmentSummary[0];
    const orderStatsMap = new Map(ordersByStatus.map((row) => [row._id, row]));

    const committedOrders =
      (orderStatsMap.get(SalesOrderStatus.CONFIRMED)?.count ?? 0) +
      (orderStatsMap.get(SalesOrderStatus.PARTIALLY_FULFILLED)?.count ?? 0) +
      (orderStatsMap.get(SalesOrderStatus.FULFILLED)?.count ?? 0);

    const committedValue =
      Math.round(
        ((orderStatsMap.get(SalesOrderStatus.CONFIRMED)?.orderValue ?? 0) +
          (orderStatsMap.get(SalesOrderStatus.PARTIALLY_FULFILLED)
            ?.orderValue ?? 0) +
          (orderStatsMap.get(SalesOrderStatus.FULFILLED)?.orderValue ?? 0)) *
          100,
      ) / 100;

    return {
      currency: SALES_APP_CURRENCY,
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      totals: {
        fulfilledRevenue:
          Math.round((fulfilledAgg?.fulfilledRevenue ?? 0) * 100) / 100,
        fulfilledUnits:
          Math.round((fulfilledAgg?.fulfilledUnits ?? 0) * 10000) / 10000,
        fulfillmentCount: fulfilledAgg?.fulfillmentCount ?? 0,
        committedOrders,
        committedValue,
        draftOrders: orderStatsMap.get(SalesOrderStatus.DRAFT)?.count ?? 0,
        draftValue:
          Math.round(
            (orderStatsMap.get(SalesOrderStatus.DRAFT)?.orderValue ?? 0) * 100,
          ) / 100,
        cancelledOrders:
          orderStatsMap.get(SalesOrderStatus.CANCELLED)?.count ?? 0,
        cancelledValue:
          Math.round(
            (orderStatsMap.get(SalesOrderStatus.CANCELLED)?.orderValue ?? 0) *
              100,
          ) / 100,
      },
      ordersByStatus: ordersByStatus.map((s) => ({
        status: s._id,
        count: s.count,
        orderValue: Math.round(s.orderValue * 100) / 100,
      })),
      dailyTrend: dailyFulfillments.map((d) => ({
        date: d._id,
        fulfillments: d.fulfillments,
        units: Math.round(d.units * 10000) / 10000,
        revenue: Math.round(d.revenue * 100) / 100,
      })),
      topCustomers: topCustomers.map((c) => ({
        customerId: c._id,
        customerName: c.customerName,
        customerCode: c.customerCode,
        fulfillments: c.fulfillments,
        units: Math.round(c.units * 10000) / 10000,
        revenue: Math.round(c.revenue * 100) / 100,
      })),
    };
  }

  async getTopProducts(query: SalesAnalyticsQueryDto) {
    const { startDate, endDate, days } = resolvePeriodBounds(query);
    const limit = query.limit ?? 15;
    const warehouseObjId: Types.ObjectId | undefined = query.warehouseId
      ? ensureValidObjectId(query.warehouseId, 'warehouse')
      : undefined;

    const fulfillmentMatch: Record<string, any> = {
      fulfilledDate: { $gte: startDate, $lte: endDate },
    };
    if (warehouseObjId) {
      fulfillmentMatch.warehouseId = warehouseObjId;
    }

    const items = await this.fulfillmentModel
      .aggregate<{
        _id: Types.ObjectId;
        productName: string;
        sku: string;
        unitSymbol: string;
        unitsSold: number;
        revenue: number;
        fulfillmentCount: number;
        lastSoldAt: Date;
      }>([
        { $match: fulfillmentMatch },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            productName: { $first: '$items.productName' },
            sku: { $first: '$items.sku' },
            unitSymbol: { $first: '$items.unitSymbol' },
            unitsSold: { $sum: '$items.fulfilledQuantity' },
            revenue: { $sum: '$items.lineFulfilledAmount' },
            fulfillmentCount: { $sum: 1 },
            lastSoldAt: { $max: '$fulfilledDate' },
          },
        },
        { $sort: { revenue: -1, unitsSold: -1 } },
        { $limit: limit },
      ])
      .exec();

    return {
      currency: SALES_APP_CURRENCY,
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      items: items.map((row) => ({
        productId: row._id,
        productName: row.productName,
        sku: row.sku,
        unitSymbol: row.unitSymbol,
        unitsSold: Math.round(row.unitsSold * 10000) / 10000,
        revenue: Math.round(row.revenue * 100) / 100,
        fulfillmentCount: row.fulfillmentCount,
        lastSoldAt: row.lastSoldAt,
      })),
    };
  }
}
