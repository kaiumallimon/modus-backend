import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BasePaginationQueryDto } from '../../../inventory/common/dto/pagination-query.dto';
import { SalesPricingAdjustmentType } from '../../common/utils/money.util';
import { SalesOrderStatus } from '../schemas/sales-order.schema';

export class SalesOrderItemInputDto {
  @ApiProperty()
  @IsMongoId()
  productId: string;

  @ApiProperty({ example: 5 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  orderedQuantity: number;

  @ApiPropertyOptional({
    example: 24.5,
    description:
      'Selling unit price snapshot. Defaults to product sellingPrice when omitted.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({
    enum: SalesPricingAdjustmentType,
    default: SalesPricingAdjustmentType.FIXED,
  })
  @IsOptional()
  @IsEnum(SalesPricingAdjustmentType)
  discountType?: SalesPricingAdjustmentType;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountValue?: number;

  @ApiPropertyOptional({
    enum: SalesPricingAdjustmentType,
    default: SalesPricingAdjustmentType.FIXED,
  })
  @IsOptional()
  @IsEnum(SalesPricingAdjustmentType)
  taxType?: SalesPricingAdjustmentType;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxValue?: number;
}

export class CreateSalesOrderDto {
  @ApiProperty()
  @IsMongoId()
  customerId: string;

  @ApiProperty()
  @IsMongoId()
  warehouseId: string;

  @ApiPropertyOptional({ example: '2026-11-26T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @ApiPropertyOptional({ example: '2026-11-30T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string;

  @ApiProperty({ type: [SalesOrderItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemInputDto)
  items: SalesOrderItemInputDto[];

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateSalesOrderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  orderDate?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string | null;

  @ApiPropertyOptional({ type: [SalesOrderItemInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderItemInputDto)
  items?: SalesOrderItemInputDto[];

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CancelSalesOrderDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class QuerySalesOrderDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ enum: SalesOrderStatus })
  @IsOptional()
  @IsEnum(SalesOrderStatus)
  status?: SalesOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  warehouseId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    enum: ['orderDate', 'orderNumber', 'grandTotal', 'createdAt', 'status'],
    default: 'orderDate',
  })
  @IsOptional()
  @IsString()
  sortBy?: 'orderDate' | 'orderNumber' | 'grandTotal' | 'createdAt' | 'status';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
