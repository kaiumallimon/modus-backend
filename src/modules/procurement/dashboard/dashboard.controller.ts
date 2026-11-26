import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProcurementDashboardService } from './dashboard.service';
import { RequireAnyPermission } from '../../../common/decorators/permissions.decorator';
import { RequireModule } from '../../inventory/common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../../inventory/common/guards/module-active.guard';
import {
  PROCUREMENT_ANY_READ_PERMISSIONS,
  PROCUREMENT_MODULE_ID,
} from '../common/constants/procurement-permissions.constant';
import { INVENTORY_MODULE_ID } from '../../inventory/common/constants/inventory-permissions.constant';

@ApiTags('Procurement — Dashboard')
@ApiBearerAuth()
@RequireModule(PROCUREMENT_MODULE_ID, INVENTORY_MODULE_ID)
@UseGuards(ModuleActiveGuard)
@Controller('procurement/dashboard')
export class ProcurementDashboardController {
  constructor(private readonly dashboardService: ProcurementDashboardService) {}

  @Get()
  @RequireAnyPermission(...PROCUREMENT_ANY_READ_PERMISSIONS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get Procurement overview metrics, PO status distribution, and recent POs/receipts',
  })
  getSummary() {
    return this.dashboardService.getSummary();
  }
}
