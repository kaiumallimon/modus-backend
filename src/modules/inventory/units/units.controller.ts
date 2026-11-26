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
import { UnitsService } from './units.service';
import { CreateUnitDto, QueryUnitDto, UpdateUnitDto } from './dto/unit.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../common/guards/module-active.guard';
import { INVENTORY_MODULE_ID } from '../common/constants/inventory-permissions.constant';
import { buildAuditContext } from '../common/utils/transaction.util';

@ApiTags('Inventory — Units')
@ApiBearerAuth()
@RequireModule(INVENTORY_MODULE_ID)
@UseGuards(ModuleActiveGuard)
@Controller('inventory/units')
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  @RequirePermissions('inventory.units.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a unit of measurement' })
  @ApiResponse({ status: 201, description: 'Unit created successfully' })
  create(
    @Body() dto: CreateUnitDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.unitsService.create(dto, buildAuditContext(currentUser, req));
  }

  @Get()
  @RequirePermissions('inventory.units.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List units of measurement' })
  findAll(@Query() query: QueryUnitDto) {
    return this.unitsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('inventory.units.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get single unit of measurement' })
  @ApiParam({ name: 'id', description: 'Unit MongoDB ID' })
  findOne(@Param('id') id: string) {
    return this.unitsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('inventory.units.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update unit of measurement' })
  @ApiParam({ name: 'id', description: 'Unit MongoDB ID' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUnitDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.unitsService.update(id, dto, buildAuditContext(currentUser, req));
  }

  @Patch(':id/archive')
  @RequirePermissions('inventory.units.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive unit of measurement safely' })
  @ApiParam({ name: 'id', description: 'Unit MongoDB ID' })
  archive(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.unitsService.archive(id, buildAuditContext(currentUser, req));
  }

  @Delete(':id')
  @RequirePermissions('inventory.units.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an unreferenced unit of measurement (blocked if in use by products)',
  })
  @ApiParam({ name: 'id', description: 'Unit MongoDB ID' })
  remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.unitsService.remove(id, buildAuditContext(currentUser, req));
  }
}
