import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import {
  ProductCategory,
  ProductCategoryDocument,
} from '../categories/schemas/product-category.schema';
import {
  UnitOfMeasurement,
  UnitOfMeasurementDocument,
} from '../units/schemas/unit-of-measurement.schema';
import {
  Warehouse,
  WarehouseDocument,
} from '../warehouses/schemas/warehouse.schema';
import {
  StockBalance,
  StockBalanceDocument,
} from '../stock/schemas/stock-balance.schema';
import {
  StockMovement,
  StockMovementDocument,
} from '../movements/schemas/stock-movement.schema';
import {
  StockTransfer,
  StockTransferDocument,
  TransferStatus,
} from '../transfers/schemas/stock-transfer.schema';

@Injectable()
export class InventoryDashboardService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectModel(ProductCategory.name)
    private readonly categoryModel: Model<ProductCategoryDocument>,
    @InjectModel(UnitOfMeasurement.name)
    private readonly unitModel: Model<UnitOfMeasurementDocument>,
    @InjectModel(Warehouse.name)
    private readonly warehouseModel: Model<WarehouseDocument>,
    @InjectModel(StockBalance.name)
    private readonly balanceModel: Model<StockBalanceDocument>,
    @InjectModel(StockMovement.name)
    private readonly movementModel: Model<StockMovementDocument>,
    @InjectModel(StockTransfer.name)
    private readonly transferModel: Model<StockTransferDocument>,
  ) {}

  async getSummary() {
    const [
      totalActiveProducts,
      totalProducts,
      totalCategories,
      totalUnits,
      totalWarehouses,
      pendingTransfersCount,
      activeProducts,
      balanceTotalsByProduct,
      warehouseSummaryAgg,
      recentMovements,
    ] = await Promise.all([
      this.productModel.countDocuments({ isActive: true }).exec(),
      this.productModel.countDocuments().exec(),
      this.categoryModel.countDocuments({ isActive: true }).exec(),
      this.unitModel.countDocuments({ isActive: true }).exec(),
      this.warehouseModel.countDocuments({ isActive: true }).exec(),
      this.transferModel
        .countDocuments({ status: TransferStatus.PENDING })
        .exec(),
      this.productModel
        .find({ isActive: true })
        .select('name sku minStockThreshold unitId categoryId')
        .populate('unitId', 'name symbol')
        .populate('categoryId', 'name')
        .exec(),
      this.balanceModel
        .aggregate([
          {
            $group: {
              _id: '$productId',
              totalQuantity: { $sum: '$quantity' },
            },
          },
        ])
        .exec(),
      this.balanceModel
        .aggregate([
          { $match: { quantity: { $gt: 0 } } },
          {
            $group: {
              _id: '$warehouseId',
              skuCount: { $sum: 1 },
              totalUnits: { $sum: '$quantity' },
            },
          },
          {
            $lookup: {
              from: 'inventory_warehouses',
              localField: '_id',
              foreignField: '_id',
              as: 'warehouse',
            },
          },
          { $unwind: '$warehouse' },
          {
            $project: {
              warehouseId: '$warehouse._id',
              name: '$warehouse.name',
              code: '$warehouse.code',
              isActive: '$warehouse.isActive',
              skuCount: 1,
              totalUnits: 1,
            },
          },
          { $sort: { totalUnits: -1 } },
        ])
        .exec(),
      this.movementModel
        .find()
        .populate({
          path: 'productId',
          select: 'name sku unitId',
          populate: { path: 'unitId', select: 'name symbol' },
        })
        .populate('warehouseId', 'name code')
        .sort({ createdAt: -1, _id: -1 })
        .limit(8)
        .exec(),
    ]);

    const productStockMap = new Map<string, number>();
    let totalStockUnits = 0;

    for (const row of balanceTotalsByProduct as Array<{
      _id: Types.ObjectId;
      totalQuantity: number;
    }>) {
      const qty = Math.round((row.totalQuantity || 0) * 10000) / 10000;
      productStockMap.set(row._id.toString(), qty);
      totalStockUnits += qty;
    }
    totalStockUnits = Math.round(totalStockUnits * 10000) / 10000;

    let lowStockProductsCount = 0;
    let outOfStockProductsCount = 0;
    const alertProducts: Array<{
      _id: string;
      name: string;
      sku: string;
      totalStock: number;
      minStockThreshold: number;
      unit: any;
      category: any;
      status: 'OUT_OF_STOCK' | 'LOW_STOCK';
    }> = [];

    for (const prod of activeProducts) {
      const totalStock = productStockMap.get(prod._id.toString()) ?? 0;
      const threshold = prod.minStockThreshold ?? 0;

      if (totalStock <= 0) {
        outOfStockProductsCount++;
        alertProducts.push({
          _id: prod._id.toString(),
          name: prod.name,
          sku: prod.sku,
          totalStock,
          minStockThreshold: threshold,
          unit: prod.unitId,
          category: prod.categoryId,
          status: 'OUT_OF_STOCK',
        });
      } else if (threshold > 0 && totalStock <= threshold) {
        lowStockProductsCount++;
        alertProducts.push({
          _id: prod._id.toString(),
          name: prod.name,
          sku: prod.sku,
          totalStock,
          minStockThreshold: threshold,
          unit: prod.unitId,
          category: prod.categoryId,
          status: 'LOW_STOCK',
        });
      }
    }

    alertProducts.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'OUT_OF_STOCK' ? -1 : 1;
      }
      return a.totalStock - b.totalStock;
    });

    return {
      metrics: {
        totalActiveProducts,
        totalProducts,
        totalCategories,
        totalUnits,
        totalWarehouses,
        totalStockUnits,
        lowStockProductsCount,
        outOfStockProductsCount,
        pendingTransfersCount,
      },
      lowStockProducts: alertProducts.slice(0, 8),
      warehouseSummary: warehouseSummaryAgg,
      recentMovements,
    };
  }
}
