import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  CancelPurchaseOrderDto,
  CreatePurchaseOrderDto,
  QueryPurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { RequireModule } from '../../inventory/common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../../inventory/common/guards/module-active.guard';
import { buildAuditContext } from '../../inventory/common/utils/transaction.util';
import { PROCUREMENT_MODULE_ID } from '../common/constants/procurement-permissions.constant';
import { INVENTORY_MODULE_ID } from '../../inventory/common/constants/inventory-permissions.constant';

@ApiTags('Procurement — Purchase Orders')
@ApiBearerAuth()
@RequireModule(PROCUREMENT_MODULE_ID, INVENTORY_MODULE_ID)
@UseGuards(ModuleActiveGuard)
@Controller('procurement/purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly poService: PurchaseOrdersService) {}

  @Post()
  @RequirePermissions('procurement.purchase-orders.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a draft purchase order' })
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.poService.create(dto, buildAuditContext(currentUser, req));
  }

  @Get()
  @RequirePermissions('procurement.purchase-orders.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List purchase orders with search, supplier, status & date filters',
  })
  findAll(@Query() query: QueryPurchaseOrderDto) {
    return this.poService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('procurement.purchase-orders.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get purchase order details, line pricing, and linked receipts',
  })
  findOne(@Param('id') id: string) {
    return this.poService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('procurement.purchase-orders.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a draft purchase order' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.poService.update(id, dto, buildAuditContext(currentUser, req));
  }

  @Post(':id/submit')
  @RequirePermissions('procurement.purchase-orders.submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit draft purchase order (DRAFT -> ORDERED)' })
  submit(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.poService.submit(id, buildAuditContext(currentUser, req));
  }

  @Post(':id/cancel')
  @RequirePermissions('procurement.purchase-orders.cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cancel draft or unreceived ordered purchase order (blocked if goods received)',
  })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelPurchaseOrderDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.poService.cancel(
      id,
      dto,
      buildAuditContext(currentUser, req),
    );
  }
}
