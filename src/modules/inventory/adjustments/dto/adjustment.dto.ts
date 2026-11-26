import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { BasePaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AdjustmentType } from '../schemas/stock-adjustment.schema';

export class CreateStockAdjustmentDto {
  @ApiProperty({ enum: AdjustmentType, example: AdjustmentType.OPENING_STOCK })
  @IsEnum(AdjustmentType)
  @IsNotEmpty()
  adjustmentType: AdjustmentType;

  @ApiProperty({ example: '64f1b2c3d4e5f6a7b8c9d0e1' })
  @IsMongoId()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: '64f1b2c3d4e5f6a7b8c9d0e2' })
  @IsMongoId()
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ example: 50, exclusiveMinimum: true })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity: number;

  @ApiProperty({ example: 'Initial physical warehouse count' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  reason: string;

  @ApiPropertyOptional({ example: 'Verified on Shelf A-12' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({
    example: 'ADJ-20261126-OPEN01',
    description: 'Optional custom unique reference number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  referenceNumber?: string;

  @ApiPropertyOptional({
    description: 'Optional client idempotency key to prevent duplicate submissions',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class QueryStockAdjustmentDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ enum: AdjustmentType })
  @IsOptional()
  @IsEnum(AdjustmentType)
  adjustmentType?: AdjustmentType;

  @ApiPropertyOptional({ description: 'Filter by product ID' })
  @IsOptional()
  @IsMongoId()
  productId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse ID' })
  @IsOptional()
  @IsMongoId()
  warehouseId?: string;
}
