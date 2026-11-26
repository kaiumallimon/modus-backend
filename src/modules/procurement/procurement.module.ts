import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ModuleRegistryModule } from '../module-registry/module-registry.module';
import { ModuleRegistryService } from '../module-registry/module-registry.service';
import { InventoryModule } from '../inventory/inventory.module';
import { INVENTORY_MODULE_ID } from '../inventory/common/constants/inventory-permissions.constant';
import { ModuleActiveGuard } from '../inventory/common/guards/module-active.guard';
import {
  PROCUREMENT_MODULE_ID,
  PROCUREMENT_PERMISSION_GROUPS,
  PROCUREMENT_PERMISSIONS,
} from './common/constants/procurement-permissions.constant';
import { Supplier, SupplierSchema } from './suppliers/schemas/supplier.schema';
import { SuppliersService } from './suppliers/suppliers.service';
import { SuppliersController } from './suppliers/suppliers.controller';
import {
  PurchaseOrder,
  PurchaseOrderSchema,
} from './purchase-orders/schemas/purchase-order.schema';
import { PurchaseOrdersService } from './purchase-orders/purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders/purchase-orders.controller';
import {
  GoodsReceipt,
  GoodsReceiptSchema,
} from './goods-receipts/schemas/goods-receipt.schema';
import { GoodsReceiptsService } from './goods-receipts/goods-receipts.service';
import { GoodsReceiptsController } from './goods-receipts/goods-receipts.controller';
import { SupplierTransactionsService } from './supplier-transactions/supplier-transactions.service';
import { SupplierTransactionsController } from './supplier-transactions/supplier-transactions.controller';
import { ProcurementDashboardService } from './dashboard/dashboard.service';
import { ProcurementDashboardController } from './dashboard/dashboard.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Supplier.name, schema: SupplierSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: GoodsReceipt.name, schema: GoodsReceiptSchema },
    ]),
    InventoryModule,
    AccessControlModule,
    AuditLogModule,
    ModuleRegistryModule,
  ],
  controllers: [
    ProcurementDashboardController,
    SuppliersController,
    PurchaseOrdersController,
    GoodsReceiptsController,
    SupplierTransactionsController,
  ],
  providers: [
    ModuleActiveGuard,
    SuppliersService,
    PurchaseOrdersService,
    GoodsReceiptsService,
    SupplierTransactionsService,
    ProcurementDashboardService,
  ],
  exports: [
    SuppliersService,
    PurchaseOrdersService,
    GoodsReceiptsService,
    SupplierTransactionsService,
    ProcurementDashboardService,
  ],
})
export class ProcurementModule implements OnModuleInit {
  constructor(private readonly moduleRegistryService: ModuleRegistryService) {}

  async onModuleInit(): Promise<void> {
    await this.moduleRegistryService.registerModule({
      id: PROCUREMENT_MODULE_ID,
      name: 'Procurement',
      description:
        'Manage suppliers, purchase orders, goods receiving, and supplier transaction statements.',
      version: '1.0.0',
      isCore: false,
      defaultActivated: true,
      dependencies: [
        INVENTORY_MODULE_ID,
        'users',
        'access-control',
        'audit-log',
      ],
      permissions: PROCUREMENT_PERMISSIONS,
      permissionGroups: PROCUREMENT_PERMISSION_GROUPS,
    });
  }
}
