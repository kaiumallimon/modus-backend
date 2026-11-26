import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
import { GoodsReceiptStatus } from '../schemas/goods-receipt.schema';

export class GoodsReceiptItemInputDto {
  @ApiProperty({ description: 'Inventory product ID from the purchase order' })
  @IsMongoId()
  productId: string;

  @ApiProperty({ example: 25 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  receivedQuantity: number;
}

export class CreateGoodsReceiptDto {
  @ApiProperty({ description: 'Ordered or Partially Received PO ID' })
  @IsMongoId()
  purchaseOrderId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  receivedDate?: string;

  @ApiProperty({ type: [GoodsReceiptItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptItemInputDto)
  items: GoodsReceiptItemInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Optional client idempotency key' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description: 'Optionally confirm immediately on creation',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  confirmImmediately?: boolean;
}

export class ConfirmGoodsReceiptDto {
  @ApiPropertyOptional({ description: 'Optional client idempotency key' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  idempotencyKey?: string;
}

export class QueryGoodsReceiptDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ enum: GoodsReceiptStatus })
  @IsOptional()
  @IsEnum(GoodsReceiptStatus)
  status?: GoodsReceiptStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  purchaseOrderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  supplierId?: string;

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
}
