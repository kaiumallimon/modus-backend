import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { GoodsReceiptsService } from './goods-receipts.service';
import {
  ConfirmGoodsReceiptDto,
  CreateGoodsReceiptDto,
  QueryGoodsReceiptDto,
} from './dto/goods-receipt.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { AccessControlService } from '../../access-control/access-control.service';
import { Role } from '../../users/enums/role.enum';
import { RequireModule } from '../../inventory/common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../../inventory/common/guards/module-active.guard';
import { buildAuditContext } from '../../inventory/common/utils/transaction.util';
import { PROCUREMENT_MODULE_ID } from '../common/constants/procurement-permissions.constant';
import { INVENTORY_MODULE_ID } from '../../inventory/common/constants/inventory-permissions.constant';

@ApiTags('Procurement — Goods Receipts')
@ApiBearerAuth()
@RequireModule(PROCUREMENT_MODULE_ID, INVENTORY_MODULE_ID)
@UseGuards(ModuleActiveGuard)
@Controller('procurement/goods-receipts')
export class GoodsReceiptsController {
  constructor(
    private readonly receiptsService: GoodsReceiptsService,
    private readonly accessControlService: AccessControlService,
  ) {}

  @Post()
  @RequirePermissions('procurement.goods-receipts.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Create a goods receipt against an ordered/partially received PO (optional immediate confirm with procurement.goods-receipts.confirm)',
  })
  async create(
    @Body() dto: CreateGoodsReceiptDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    if (
      dto.confirmImmediately &&
      currentUser.role !== Role.SUPER_ADMIN &&
      !(await this.accessControlService.hasPermission(
        currentUser.role,
        'procurement.goods-receipts.confirm',
      ))
    ) {
      throw new ForbiddenException(
        'Missing permission "procurement.goods-receipts.confirm" to confirm goods receipt immediately',
      );
    }

    return this.receiptsService.create(
      dto,
      buildAuditContext(currentUser, req),
    );
  }

  @Post(':id/confirm')
  @RequirePermissions('procurement.goods-receipts.confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Confirm goods receipt atomically — increments Inventory warehouse stock and records PURCHASE_RECEIPT movements',
  })
  confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmGoodsReceiptDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.receiptsService.confirm(
      id,
      dto,
      buildAuditContext(currentUser, req),
    );
  }

  @Get()
  @RequirePermissions('procurement.goods-receipts.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'List goods receipts with search, PO, supplier, warehouse, and date filters',
  })
  findAll(@Query() query: QueryGoodsReceiptDto) {
    return this.receiptsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('procurement.goods-receipts.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get goods receipt details and item quantities' })
  findOne(@Param('id') id: string) {
    return this.receiptsService.findOne(id);
  }
}
