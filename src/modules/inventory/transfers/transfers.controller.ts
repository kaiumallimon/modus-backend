import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { TransfersService } from './transfers.service';
import {
  CreateStockTransferDto,
  QueryStockTransferDto,
} from './dto/transfer.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../common/guards/module-active.guard';
import { INVENTORY_MODULE_ID } from '../common/constants/inventory-permissions.constant';
import { buildAuditContext } from '../common/utils/transaction.util';

@ApiTags('Inventory — Stock Transfers')
@ApiBearerAuth()
@RequireModule(INVENTORY_MODULE_ID)
@UseGuards(ModuleActiveGuard)
@Controller('inventory/transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @RequirePermissions('inventory.stock.transfer')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a pending stock transfer between two warehouses after checking source stock',
  })
  @ApiResponse({ status: 201, description: 'Pending transfer created' })
  create(
    @Body() dto: CreateStockTransferDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.transfersService.create(
      dto,
      buildAuditContext(currentUser, req),
    );
  }

  @Post(':id/confirm')
  @RequirePermissions('inventory.stock.transfer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm a pending transfer atomically (decreases source, increases destination, logs movements)',
  })
  @ApiParam({ name: 'id', description: 'Stock Transfer MongoDB ID' })
  @ApiResponse({ status: 200, description: 'Transfer confirmed atomically' })
  @ApiResponse({ status: 409, description: 'Transfer already confirmed' })
  confirm(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.transfersService.confirm(
      id,
      buildAuditContext(currentUser, req),
    );
  }

  @Get()
  @RequirePermissions('inventory.stock.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List stock transfers with filtering and pagination' })
  findAll(@Query() query: QueryStockTransferDto) {
    return this.transfersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('inventory.stock.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get single stock transfer details' })
  @ApiParam({ name: 'id', description: 'Stock Transfer MongoDB ID' })
  findOne(@Param('id') id: string) {
    return this.transfersService.findOne(id);
  }
}
