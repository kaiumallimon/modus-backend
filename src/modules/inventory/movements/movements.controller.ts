import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { MovementsService } from './movements.service';
import { QueryStockMovementDto } from './dto/stock-movement.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../common/guards/module-active.guard';
import { INVENTORY_MODULE_ID } from '../common/constants/inventory-permissions.constant';

@ApiTags('Inventory — Movement Ledger')
@ApiBearerAuth()
@RequireModule(INVENTORY_MODULE_ID)
@UseGuards(ModuleActiveGuard)
@Controller('inventory/movements')
export class MovementsController {
  constructor(private readonly movementsService: MovementsService) {}

  @Get()
  @RequirePermissions('inventory.movements.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List append-only stock movement ledger entries with filtering and pagination',
  })
  findAll(@Query() query: QueryStockMovementDto) {
    return this.movementsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('inventory.movements.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get single append-only stock movement entry by ID' })
  @ApiParam({ name: 'id', description: 'Stock Movement MongoDB ID' })
  findOne(@Param('id') id: string) {
    return this.movementsService.findOne(id);
  }
}
