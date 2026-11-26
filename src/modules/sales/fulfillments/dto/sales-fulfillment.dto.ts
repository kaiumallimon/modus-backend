import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { BasePaginationQueryDto } from '../../../inventory/common/dto/pagination-query.dto';

export class FulfillOrderItemDto {
  @ApiProperty()
  @IsMongoId()
  productId: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  fulfilledQuantity: number;
}

export class FulfillSalesOrderDto {
  @ApiProperty({ type: [FulfillOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FulfillOrderItemDto)
  items: FulfillOrderItemDto[];

  @ApiPropertyOptional({ example: '2026-11-26T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  fulfilledDate?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    maxLength: 120,
    description: 'Optional idempotency key to prevent duplicate fulfillment retries',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}

export class QuerySalesFulfillmentDto extends BasePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  salesOrderId?: string;

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
    enum: ['fulfilledDate', 'fulfillmentNumber', 'totalFulfilledValue', 'createdAt'],
    default: 'fulfilledDate',
  })
  @IsOptional()
  @IsString()
  sortBy?:
    | 'fulfilledDate'
    | 'fulfillmentNumber'
    | 'totalFulfilledValue'
    | 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
