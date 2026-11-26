import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { INVENTORY_MODULE_ID } from '../../inventory/common/constants/inventory-permissions.constant';
import { RequireModule } from '../../inventory/common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../../inventory/common/guards/module-active.guard';
import { buildAuditContext } from '../../inventory/common/utils/transaction.util';
import { SALES_MODULE_ID } from '../common/constants/sales-permissions.constant';
import {
  FulfillSalesOrderDto,
  QuerySalesFulfillmentDto,
} from './dto/sales-fulfillment.dto';
import { SalesFulfillmentsService } from './sales-fulfillments.service';

@ApiTags('Sales — Fulfillments')
@ApiBearerAuth()
@UseGuards(ModuleActiveGuard)
@RequireModule(SALES_MODULE_ID, INVENTORY_MODULE_ID)
@Controller('sales')
export class SalesFulfillmentsController {
  constructor(
    private readonly fulfillmentsService: SalesFulfillmentsService,
  ) {}

  @Post('orders/:id/fulfill')
  @RequirePermissions('sales.fulfillments.create')
  @ApiOperation({
    summary:
      'Fulfill confirmed sales order items (partial or full) and deduct warehouse inventory',
  })
  fulfillOrder(
    @Param('id') id: string,
    @Body() dto: FulfillSalesOrderDto,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.fulfillmentsService.fulfillOrder(
      id,
      dto,
      buildAuditContext(user, req),
    );
  }

  @Get('fulfillments')
  @RequirePermissions('sales.fulfillments.read')
  @ApiOperation({ summary: 'List sales fulfillments with search and date filtering' })
  findAll(@Query() query: QuerySalesFulfillmentDto) {
    return this.fulfillmentsService.findAll(query);
  }

  @Get('fulfillments/:id')
  @RequirePermissions('sales.fulfillments.read')
  @ApiOperation({ summary: 'Get sales fulfillment details' })
  findOne(@Param('id') id: string) {
    return this.fulfillmentsService.findOne(id);
  }
}
