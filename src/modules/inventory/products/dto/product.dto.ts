import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BasePaginationQueryDto,
  TransformBooleanQuery,
} from '../../common/dto/pagination-query.dto';

export class CreateProductDto {
  @ApiProperty({ example: 'Surgical Latex Gloves (Box of 100)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiProperty({ example: 'MED-GLV-100' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._-]+$/, {
    message:
      'SKU may only contain letters, numbers, dots, hyphens, and underscores',
  })
  sku: string;

  @ApiPropertyOptional({ example: '8901234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string | null;

  @ApiPropertyOptional({ example: 'Powder-free sterile surgical gloves' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: '64f1b2c3d4e5f6a7b8c9d0e1' })
  @IsMongoId()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({ example: '64f1b2c3d4e5f6a7b8c9d0e2' })
  @IsMongoId()
  @IsNotEmpty()
  unitId: string;

  @ApiProperty({ example: 12.5, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  costPrice: number;

  @ApiPropertyOptional({ example: 19.99, minimum: 0, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  sellingPrice?: number | null;

  @ApiPropertyOptional({ example: 25, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  minStockThreshold?: number;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/products/gloves.png',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @ApiPropertyOptional({ example: 'products/gloves.png', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageKey?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class QueryProductDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by unit ID' })
  @IsOptional()
  @IsMongoId()
  unitId?: string;

  @ApiPropertyOptional({ description: 'Filter by active/archived status' })
  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: ['name', 'sku', 'costPrice', 'sellingPrice', 'minStockThreshold', 'createdAt', 'updatedAt'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn([
    'name',
    'sku',
    'costPrice',
    'sellingPrice',
    'minStockThreshold',
    'createdAt',
    'updatedAt',
  ])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
