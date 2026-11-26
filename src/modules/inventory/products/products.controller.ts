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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import 'multer';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  QueryProductDto,
  UpdateProductDto,
} from './dto/product.dto';
import { RequirePermissions } from '../../../common/decorators/permissions.decorator';
import {
  CurrentUser,
  type CurrentUserPayload,
} from '../../../common/decorators/current-user.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleActiveGuard } from '../common/guards/module-active.guard';
import { INVENTORY_MODULE_ID } from '../common/constants/inventory-permissions.constant';
import { buildAuditContext } from '../common/utils/transaction.util';

@ApiTags('Inventory — Products')
@ApiBearerAuth()
@RequireModule(INVENTORY_MODULE_ID)
@UseGuards(ModuleActiveGuard)
@Controller('inventory/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @RequirePermissions('inventory.products.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new inventory product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 409, description: 'Duplicate SKU or barcode' })
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.productsService.create(dto, buildAuditContext(currentUser, req));
  }

  @Get()
  @RequirePermissions('inventory.products.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List products with search, category/unit/status filters, sorting, and pagination',
  })
  findAll(@Query() query: QueryProductDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('inventory.products.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get single product details along with per-warehouse balances and recent movements',
  })
  @ApiParam({ name: 'id', description: 'Product MongoDB ID' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('inventory.products.update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update product metadata, pricing, and thresholds (stock updates prohibited)',
  })
  @ApiParam({ name: 'id', description: 'Product MongoDB ID' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.productsService.update(
      id,
      dto,
      buildAuditContext(currentUser, req),
    );
  }

  @Post(':id/image')
  @RequirePermissions('inventory.products.update')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload or replace product image via Cloudflare R2 CDN' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.productsService.uploadImage(
      id,
      file,
      buildAuditContext(currentUser, req),
    );
  }

  @Patch(':id/archive')
  @RequirePermissions('inventory.products.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a product safely without deleting history' })
  @ApiParam({ name: 'id', description: 'Product MongoDB ID' })
  archive(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.productsService.archive(id, buildAuditContext(currentUser, req));
  }

  @Delete(':id')
  @RequirePermissions('inventory.products.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an unused product, or safely archive it if historical stock/movements exist',
  })
  @ApiParam({ name: 'id', description: 'Product MongoDB ID' })
  remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: CurrentUserPayload,
    @Req() req: Request,
  ) {
    return this.productsService.remove(id, buildAuditContext(currentUser, req));
  }
}
