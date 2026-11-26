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
import { RequireModule } from '../../inventory/common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../../inventory/common/guards/module-active.guard';
import { INVENTORY_MODULE_ID } from '../../inventory/common/constants/inventory-permissions.constant';
import { BasePaginationQueryDto } from '../../inventory/common/dto/pagination-query.dto';
import { buildAuditContext } from '../../inventory/common/utils/transaction.util';
import { SALES_MODULE_ID } from '../common/constants/sales-permissions.constant';
import { CustomersService } from './customers.service';
import {
  ArchiveCustomerDto,
  CreateCustomerDto,
  QueryCustomerDto,
  UpdateCustomerDto,
} from './dto/customer.dto';

@ApiTags('Sales — Customers')
@ApiBearerAuth()
@UseGuards(ModuleActiveGuard)
@RequireModule(SALES_MODULE_ID, INVENTORY_MODULE_ID)
@Controller('sales/customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @RequirePermissions('sales.customers.create')
  @ApiOperation({ summary: 'Create a new customer' })
  create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.customersService.create(dto, buildAuditContext(user, req));
  }

  @Get()
  @RequirePermissions('sales.customers.read')
  @ApiOperation({ summary: 'List customers with search, status filter, and order metrics' })
  findAll(@Query() query: QueryCustomerDto) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('sales.customers.read')
  @ApiOperation({ summary: 'Get customer details and order summary' })
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('sales.customers.update')
  @ApiOperation({ summary: 'Update customer information' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.customersService.update(id, dto, buildAuditContext(user, req));
  }

  @Patch(':id/archive')
  @RequirePermissions('sales.customers.archive')
  @ApiOperation({ summary: 'Archive or restore a customer' })
  archive(
    @Param('id') id: string,
    @Body() dto: ArchiveCustomerDto,
    @CurrentUser() user: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.customersService.archive(id, dto, buildAuditContext(user, req));
  }

  @Get(':id/orders')
  @RequirePermissions('sales.customers.read')
  @ApiOperation({ summary: 'View customer sales order and fulfillment history' })
  findCustomerOrders(
    @Param('id') id: string,
    @Query() query: BasePaginationQueryDto,
  ) {
    return this.customersService.findCustomerOrders(id, query);
  }
}
