import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InventoryDashboardService } from './dashboard.service';
import { RequireAnyPermission } from '../../../common/decorators/permissions.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../common/guards/module-active.guard';
import {
  INVENTORY_ANY_READ_PERMISSIONS,
  INVENTORY_MODULE_ID,
} from '../common/constants/inventory-permissions.constant';

@ApiTags('Inventory — Dashboard')
@ApiBearerAuth()
@RequireModule(INVENTORY_MODULE_ID)
@UseGuards(ModuleActiveGuard)
@Controller('inventory/dashboard')
export class InventoryDashboardController {
  constructor(private readonly dashboardService: InventoryDashboardService) {}

  @Get()
  @RequireAnyPermission(...INVENTORY_ANY_READ_PERMISSIONS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get Inventory overview metrics, low/out-of-stock alerts, warehouse totals, and recent movements',
  })
  getSummary() {
    return this.dashboardService.getSummary();
  }
}
