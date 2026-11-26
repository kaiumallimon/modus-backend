import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { INVENTORY_MODULE_ID } from '../inventory/common/constants/inventory-permissions.constant';
import { ModuleActiveGuard } from '../inventory/common/guards/module-active.guard';
import { InventoryModule } from '../inventory/inventory.module';
import { ModuleRegistryModule } from '../module-registry/module-registry.module';
import { ModuleRegistryService } from '../module-registry/module-registry.service';
import {
  SALES_MODULE_ID,
  SALES_PERMISSION_GROUPS,
  SALES_PERMISSIONS,
} from './common/constants/sales-permissions.constant';
import { CustomersController } from './customers/customers.controller';
import { CustomersService } from './customers/customers.service';
import { Customer, CustomerSchema } from './customers/schemas/customer.schema';
import { SalesDashboardController } from './dashboard/sales-dashboard.controller';
import { SalesDashboardService } from './dashboard/sales-dashboard.service';
import { SalesFulfillmentsController } from './fulfillments/sales-fulfillments.controller';
import { SalesFulfillmentsService } from './fulfillments/sales-fulfillments.service';
import {
  SalesFulfillment,
  SalesFulfillmentSchema,
} from './fulfillments/schemas/sales-fulfillment.schema';
import { SalesOrdersController } from './orders/sales-orders.controller';
import { SalesOrdersService } from './orders/sales-orders.service';
import {
  SalesOrder,
  SalesOrderSchema,
} from './orders/schemas/sales-order.schema';
import { SalesReportsController } from './reports/sales-reports.controller';
import { SalesReportsService } from './reports/sales-reports.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Customer.name, schema: CustomerSchema },
      { name: SalesOrder.name, schema: SalesOrderSchema },
      { name: SalesFulfillment.name, schema: SalesFulfillmentSchema },
    ]),
    InventoryModule,
    AccessControlModule,
    AuditLogModule,
    ModuleRegistryModule,
  ],
  controllers: [
    SalesDashboardController,
    CustomersController,
    SalesOrdersController,
    SalesFulfillmentsController,
    SalesReportsController,
  ],
  providers: [
    ModuleActiveGuard,
    CustomersService,
    SalesOrdersService,
    SalesFulfillmentsService,
    SalesDashboardService,
    SalesReportsService,
  ],
  exports: [
    CustomersService,
    SalesOrdersService,
    SalesFulfillmentsService,
    SalesDashboardService,
    SalesReportsService,
  ],
})
export class SalesModule implements OnModuleInit {
  constructor(private readonly moduleRegistryService: ModuleRegistryService) {}

  async onModuleInit(): Promise<void> {
    await this.moduleRegistryService.registerModule({
      id: SALES_MODULE_ID,
      name: 'Sales',
      description:
        'Manage customers, sales orders, partial and full fulfillments, and sales performance analytics.',
      version: '1.0.0',
      isCore: false,
      defaultActivated: true,
      dependencies: [
        INVENTORY_MODULE_ID,
        'users',
        'access-control',
        'audit-log',
      ],
      permissions: SALES_PERMISSIONS,
      permissionGroups: SALES_PERMISSION_GROUPS,
    });
  }
}
