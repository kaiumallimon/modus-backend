import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { INVENTORY_MODULE_ID } from '../../inventory/common/constants/inventory-permissions.constant';
import { RequireModule } from '../../inventory/common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../../inventory/common/guards/module-active.guard';
import { SALES_MODULE_ID } from '../common/constants/sales-permissions.constant';
import { SalesAnalyticsQueryDto } from './dto/sales-analytics-query.dto';
import { SalesDashboardService } from './sales-dashboard.service';

@ApiTags('Sales — Dashboard')
@ApiBearerAuth()
@UseGuards(ModuleActiveGuard)
@RequireModule(SALES_MODULE_ID, INVENTORY_MODULE_ID)
@Controller('sales/dashboard')
export class SalesDashboardController {
  constructor(private readonly dashboardService: SalesDashboardService) {}

  @Get()
  @RequirePermissions('sales.dashboard.read')
  @ApiOperation({
    summary:
      'Get Sales module KPIs, committed vs fulfilled sales metrics, trends, and recent activity',
  })
  getOverview(@Query() query: SalesAnalyticsQueryDto) {
    return this.dashboardService.getOverview(query);
  }
}
