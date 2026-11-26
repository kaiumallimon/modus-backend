import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { INVENTORY_MODULE_ID } from '../../inventory/common/constants/inventory-permissions.constant';
import { RequireModule } from '../../inventory/common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../../inventory/common/guards/module-active.guard';
import { SALES_MODULE_ID } from '../common/constants/sales-permissions.constant';
import { SalesAnalyticsQueryDto } from '../dashboard/dto/sales-analytics-query.dto';
import { SalesReportsService } from './sales-reports.service';

@ApiTags('Sales — Reports')
@ApiBearerAuth()
@UseGuards(ModuleActiveGuard)
@RequireModule(SALES_MODULE_ID, INVENTORY_MODULE_ID)
@Controller('sales/reports')
export class SalesReportsController {
  constructor(private readonly reportsService: SalesReportsService) {}

  @Get('summary')
  @RequirePermissions('sales.reports.read')
  @ApiOperation({
    summary:
      'Get fulfilled sales revenue summary, committed vs draft totals, and top customers',
  })
  getSummary(@Query() query: SalesAnalyticsQueryDto) {
    return this.reportsService.getSummary(query);
  }

  @Get('top-products')
  @RequirePermissions('sales.reports.read')
  @ApiOperation({
    summary: 'Get top-selling products ranked by fulfilled revenue and units',
  })
  getTopProducts(@Query() query: SalesAnalyticsQueryDto) {
    return this.reportsService.getTopProducts(query);
  }
}
