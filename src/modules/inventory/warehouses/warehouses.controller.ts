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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { WarehousesService } from './warehouses.service';
import {
  CreateWarehouseDto,
  QueryWarehouseDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../common/guards/module-active.guard';
import { INVENTORY_MODULE_ID } from '../common/constants/inventory-permissions.constant';
import { buildAuditContext } from '../common/utils/transaction.util';

@ApiTags('Inventory — Warehouses')
@ApiBearerAuth()
@RequireModule(INVENTORY_MODULE_ID)
@UseGuards(ModuleActiveGuard)
@Controller('inventory/warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @RequirePermissions('inventory.warehouses.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new warehouse' })
  @ApiResponse({ status: 201, description: 'Warehouse created successfully' })
  create(
    @Body() dto: CreateWarehouseDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.warehousesService.create(
      dto,
      buildAuditContext(currentUser, req),
    );
  }

  @Get()
  @RequirePermissions('inventory.warehouses.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List warehouses with search and pagination' })
  findAll(@Query() query: QueryWarehouseDto) {
    return this.warehousesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('inventory.warehouses.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get warehouse details along with stocked items summary and recent movements',
  })
  @ApiParam({ name: 'id', description: 'Warehouse MongoDB ID' })
  findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('inventory.warehouses.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update warehouse profile and address' })
  @ApiParam({ name: 'id', description: 'Warehouse MongoDB ID' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWarehouseDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.warehousesService.update(
      id,
      dto,
      buildAuditContext(currentUser, req),
    );
  }

  @Patch(':id/deactivate')
  @RequirePermissions('inventory.warehouses.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a warehouse without removing history' })
  @ApiParam({ name: 'id', description: 'Warehouse MongoDB ID' })
  deactivate(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.warehousesService.deactivate(
      id,
      buildAuditContext(currentUser, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('inventory.warehouses.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an unused warehouse (blocked if stock or movements exist)',
  })
  @ApiParam({ name: 'id', description: 'Warehouse MongoDB ID' })
  remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.warehousesService.remove(
      id,
      buildAuditContext(currentUser, req),
    );
  }
}
