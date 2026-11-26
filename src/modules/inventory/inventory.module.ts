import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ModuleRegistryModule } from '../module-registry/module-registry.module';
import { ModuleRegistryService } from '../module-registry/module-registry.service';
import { StorageModule } from '../storage/storage.module';
import {
  INVENTORY_MODULE_ID,
  INVENTORY_PERMISSION_GROUPS,
  INVENTORY_PERMISSIONS,
} from './common/constants/inventory-permissions.constant';
import { ModuleActiveGuard } from './common/guards/module-active.guard';
import {
  ProductCategory,
  ProductCategorySchema,
} from './categories/schemas/product-category.schema';
import { CategoriesService } from './categories/categories.service';
import { CategoriesController } from './categories/categories.controller';
import {
  UnitOfMeasurement,
  UnitOfMeasurementSchema,
} from './units/schemas/unit-of-measurement.schema';
import { UnitsService } from './units/units.service';
import { UnitsController } from './units/units.controller';
import {
  Warehouse,
  WarehouseSchema,
} from './warehouses/schemas/warehouse.schema';
import { WarehousesService } from './warehouses/warehouses.service';
import { WarehousesController } from './warehouses/warehouses.controller';
import { Product, ProductSchema } from './products/schemas/product.schema';
import { ProductsService } from './products/products.service';
import { ProductsController } from './products/products.controller';
import {
  StockBalance,
  StockBalanceSchema,
} from './stock/schemas/stock-balance.schema';
import { StockService } from './stock/stock.service';
import { StockController } from './stock/stock.controller';
import {
  StockAdjustment,
  StockAdjustmentSchema,
} from './adjustments/schemas/stock-adjustment.schema';
import { AdjustmentsService } from './adjustments/adjustments.service';
import { AdjustmentsController } from './adjustments/adjustments.controller';
import {
  StockTransfer,
  StockTransferSchema,
} from './transfers/schemas/stock-transfer.schema';
import { TransfersService } from './transfers/transfers.service';
import { TransfersController } from './transfers/transfers.controller';
import {
  StockMovement,
  StockMovementSchema,
} from './movements/schemas/stock-movement.schema';
import { MovementsService } from './movements/movements.service';
import { MovementsController } from './movements/movements.controller';
import { InventoryDashboardService } from './dashboard/dashboard.service';
import { InventoryDashboardController } from './dashboard/dashboard.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductCategory.name, schema: ProductCategorySchema },
      { name: UnitOfMeasurement.name, schema: UnitOfMeasurementSchema },
      { name: Warehouse.name, schema: WarehouseSchema },
      { name: Product.name, schema: ProductSchema },
      { name: StockBalance.name, schema: StockBalanceSchema },
      { name: StockAdjustment.name, schema: StockAdjustmentSchema },
      { name: StockTransfer.name, schema: StockTransferSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
    ]),
    AccessControlModule,
    AuditLogModule,
    ModuleRegistryModule,
    StorageModule,
  ],
  controllers: [
    InventoryDashboardController,
    ProductsController,
    CategoriesController,
    UnitsController,
    WarehousesController,
    StockController,
    AdjustmentsController,
    TransfersController,
    MovementsController,
  ],
  providers: [
    ModuleActiveGuard,
    CategoriesService,
    UnitsService,
    WarehousesService,
    ProductsService,
    StockService,
    AdjustmentsService,
    TransfersService,
    MovementsService,
    InventoryDashboardService,
  ],
  exports: [
    CategoriesService,
    UnitsService,
    WarehousesService,
    ProductsService,
    StockService,
    AdjustmentsService,
    TransfersService,
    MovementsService,
    InventoryDashboardService,
  ],
})
export class InventoryModule implements OnModuleInit {
  constructor(
    private readonly moduleRegistryService: ModuleRegistryService,
    private readonly unitsService: UnitsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.moduleRegistryService.registerModule({
      id: INVENTORY_MODULE_ID,
      name: 'Inventory',
      description:
        'Manage products, categories, units, warehouses, stock levels, adjustments, transfers, and movement history.',
      version: '1.0.0',
      isCore: false,
      defaultActivated: true,
      dependencies: ['users', 'access-control', 'audit-log'],
      permissions: INVENTORY_PERMISSIONS,
      permissionGroups: INVENTORY_PERMISSION_GROUPS,
    });

    await this.unitsService.seedDefaultUnits();
  }
}
