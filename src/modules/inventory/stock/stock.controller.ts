import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StockService } from './stock.service';
import { QueryStockDto } from './dto/stock.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../common/guards/module-active.guard';
import { INVENTORY_MODULE_ID } from '../common/constants/inventory-permissions.constant';

@ApiTags('Inventory — Stock Balances')
@ApiBearerAuth()
@RequireModule(INVENTORY_MODULE_ID)
@UseGuards(ModuleActiveGuard)
@Controller('inventory/stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  @RequirePermissions('inventory.stock.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List current per-warehouse stock balances with product, warehouse, and status filters',
  })
  findAll(@Query() query: QueryStockDto) {
    return this.stockService.findAll(query);
  }
}
