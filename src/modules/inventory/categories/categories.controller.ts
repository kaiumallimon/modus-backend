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
import { CategoriesService } from './categories.service';
import {
  CreateCategoryDto,
  QueryCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../common/guards/module-active.guard';
import { INVENTORY_MODULE_ID } from '../common/constants/inventory-permissions.constant';
import { buildAuditContext } from '../common/utils/transaction.util';

@ApiTags('Inventory — Categories')
@ApiBearerAuth()
@RequireModule(INVENTORY_MODULE_ID)
@UseGuards(ModuleActiveGuard)
@Controller('inventory/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @RequirePermissions('inventory.categories.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new product category' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiResponse({ status: 409, description: 'Category name already exists' })
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.categoriesService.create(dto, buildAuditContext(currentUser, req));
  }

  @Get()
  @RequirePermissions('inventory.categories.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List product categories with search and pagination' })
  @ApiResponse({ status: 200, description: 'Categories returned' })
  findAll(@Query() query: QueryCategoryDto) {
    return this.categoriesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('inventory.categories.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get single product category details' })
  @ApiParam({ name: 'id', description: 'Category MongoDB ID' })
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('inventory.categories.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a product category' })
  @ApiParam({ name: 'id', description: 'Category MongoDB ID' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.categoriesService.update(
      id,
      dto,
      buildAuditContext(currentUser, req),
    );
  }

  @Patch(':id/archive')
  @RequirePermissions('inventory.categories.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a product category safely' })
  @ApiParam({ name: 'id', description: 'Category MongoDB ID' })
  archive(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.categoriesService.archive(
      id,
      buildAuditContext(currentUser, req),
    );
  }

  @Delete(':id')
  @RequirePermissions('inventory.categories.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an unreferenced product category (blocked if products depend on it)',
  })
  @ApiParam({ name: 'id', description: 'Category MongoDB ID' })
  remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.categoriesService.remove(
      id,
      buildAuditContext(currentUser, req),
    );
  }
}
