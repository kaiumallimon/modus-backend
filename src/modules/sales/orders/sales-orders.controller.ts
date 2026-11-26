import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
  CancelSalesOrderDto,
  CreateSalesOrderDto,
  QuerySalesOrderDto,
  UpdateSalesOrderDto,
} from './dto/sales-order.dto';
import { SalesOrdersService } from './sales-orders.service';

@ApiTags('Sales — Orders')
@ApiBearerAuth()
@UseGuards(ModuleActiveGuard)
@RequireModule(SALES_MODULE_ID, INVENTORY_MODULE_ID)
@Controller('sales/orders')
export class SalesOrdersController {
  constructor(private readonly ordersService: SalesOrdersService) {}

  @Post()
  @RequirePermissions('sales.orders.create')
  @ApiOperation({ summary: 'Create a draft sales order' })
  create(
    @Body() dto: CreateSalesOrderDto,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.ordersService.create(dto, buildAuditContext(user, req));
  }

  @Get()
  @RequirePermissions('sales.orders.read')
  @ApiOperation({ summary: 'List sales orders with filters and pagination' })
  findAll(@Query() query: QuerySalesOrderDto) {
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('sales.orders.read')
  @ApiOperation({ summary: 'Get sales order details, stock availability, and fulfillments' })
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('sales.orders.update')
  @ApiOperation({ summary: 'Update a draft sales order' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSalesOrderDto,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.ordersService.update(id, dto, buildAuditContext(user, req));
  }

  @Post(':id/confirm')
  @RequirePermissions('sales.orders.confirm')
  @ApiOperation({
    summary: 'Confirm a draft sales order after verifying warehouse stock availability',
  })
  confirm(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.ordersService.confirm(id, buildAuditContext(user, req));
  }

  @Post(':id/cancel')
  @RequirePermissions('sales.orders.cancel')
  @ApiOperation({ summary: 'Cancel a draft or unfulfilled confirmed sales order' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelSalesOrderDto,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.ordersService.cancel(id, dto, buildAuditContext(user, req));
  }
}
