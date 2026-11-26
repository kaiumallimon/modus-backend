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
import { AdjustmentsService } from './adjustments.service';
import {
  CreateStockAdjustmentDto,
  QueryStockAdjustmentDto,
} from './dto/adjustment.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../common/guards/module-active.guard';
import { INVENTORY_MODULE_ID } from '../common/constants/inventory-permissions.constant';
import { buildAuditContext } from '../common/utils/transaction.util';

@ApiTags('Inventory — Stock Adjustments')
@ApiBearerAuth()
@RequireModule(INVENTORY_MODULE_ID)
@UseGuards(ModuleActiveGuard)
@Controller('inventory/adjustments')
export class AdjustmentsController {
  constructor(private readonly adjustmentsService: AdjustmentsService) {}

  @Post()
  @RequirePermissions('inventory.stock.adjust')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Record an opening stock, increase, or decrease adjustment atomically',
  })
  @ApiResponse({ status: 201, description: 'Adjustment recorded and stock updated' })
  @ApiResponse({ status: 400, description: 'Validation error or insufficient stock' })
  @ApiResponse({ status: 409, description: 'Duplicate reference or idempotency key' })
  create(
    @Body() dto: CreateStockAdjustmentDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.adjustmentsService.create(
      dto,
      buildAuditContext(currentUser, req),
    );
  }

  @Get()
  @RequirePermissions('inventory.stock.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List stock adjustment history with filters and pagination' })
  findAll(@Query() query: QueryStockAdjustmentDto) {
    return this.adjustmentsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('inventory.stock.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get single stock adjustment record' })
  @ApiParam({ name: 'id', description: 'Stock Adjustment MongoDB ID' })
  findOne(@Param('id') id: string) {
    return this.adjustmentsService.findOne(id);
  }
}
