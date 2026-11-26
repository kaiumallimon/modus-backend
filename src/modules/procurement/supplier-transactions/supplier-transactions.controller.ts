import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupplierTransactionsService } from './supplier-transactions.service';
import { QuerySupplierTransactionsDto } from './dto/supplier-transaction.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireModule } from '../../inventory/common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../../inventory/common/guards/module-active.guard';
import { PROCUREMENT_MODULE_ID } from '../common/constants/procurement-permissions.constant';
import { INVENTORY_MODULE_ID } from '../../inventory/common/constants/inventory-permissions.constant';

@ApiTags('Procurement — Supplier Transactions')
@ApiBearerAuth()
@RequireModule(PROCUREMENT_MODULE_ID, INVENTORY_MODULE_ID)
@UseGuards(ModuleActiveGuard)
@Controller('procurement')
export class SupplierTransactionsController {
  constructor(
    private readonly transactionsService: SupplierTransactionsService,
  ) {}

  @Get('supplier-transactions')
  @RequirePermissions('procurement.supplier-transactions.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'List procurement transaction history across purchase orders and confirmed goods receipts',
  })
  findAll(@Query() query: QuerySupplierTransactionsDto) {
    return this.transactionsService.findAll(query);
  }

  @Get('suppliers/:id/statement')
  @RequirePermissions('procurement.supplier-transactions.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get supplier purchase commitment & receiving statement (non-accounting)',
  })
  getSupplierStatement(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.transactionsService.getSupplierStatement(id, {
      startDate,
      endDate,
    });
  }
}
