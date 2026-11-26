import {
  Body,
  Controller,
  Delete,
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
import { SuppliersService } from './suppliers.service';
import {
  CreateSupplierDto,
  QuerySupplierDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
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

@ApiTags('Procurement — Suppliers')
@ApiBearerAuth()
@RequireModule(PROCUREMENT_MODULE_ID, INVENTORY_MODULE_ID)
@UseGuards(ModuleActiveGuard)
@Controller('procurement/suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @RequirePermissions('procurement.suppliers.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new supplier' })
  create(
    @Body() dto: CreateSupplierDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.suppliersService.create(
      dto,
      buildAuditContext(currentUser, req),
    );
  }

  @Get()
  @RequirePermissions('procurement.suppliers.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List suppliers with search, status, and pagination' })
  findAll(@Query() query: QuerySupplierDto) {
    return this.suppliersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('procurement.suppliers.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get supplier details with recent orders & receipts' })
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('procurement.suppliers.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update supplier details or contacts' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.suppliersService.update(
      id,
      dto,
      buildAuditContext(currentUser, req),
    );
  }

  @Patch(':id/deactivate')
  @RequirePermissions('procurement.suppliers.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a supplier safely' })
  deactivate(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.suppliersService.deactivate(
      id,
      buildAuditContext(currentUser, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('procurement.suppliers.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an unused supplier (blocked if orders/receipts exist)',
  })
  remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.suppliersService.remove(
      id,
      buildAuditContext(currentUser, req),
    );
  }
}
