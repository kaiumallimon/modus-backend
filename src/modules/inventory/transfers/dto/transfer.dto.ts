import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BasePaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { TransferStatus } from '../schemas/stock-transfer.schema';

export class StockTransferItemDto {
  @ApiProperty({ example: '64f1b2c3d4e5f6a7b8c9d0e1' })
  @IsMongoId()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ example: 15, exclusiveMinimum: true })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @IsPositive()
  quantity: number;
}

export class CreateStockTransferDto {
  @ApiProperty({ example: '64f1b2c3d4e5f6a7b8c9d0e2' })
  @IsMongoId()
  @IsNotEmpty()
  sourceWarehouseId: string;

  @ApiProperty({ example: '64f1b2c3d4e5f6a7b8c9d0e3' })
  @IsMongoId()
  @IsNotEmpty()
  destinationWarehouseId: string;

  @ApiProperty({ type: [StockTransferItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockTransferItemDto)
  items: StockTransferItemDto[];

  @ApiPropertyOptional({ example: 'Rebalancing regional buffer stock' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ example: 'TRF-20261126-REBAL01' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  referenceNumber?: string;

  @ApiPropertyOptional({
    description: 'Optional client idempotency key to prevent duplicate transfer creation',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;
}

export class QueryStockTransferDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ enum: TransferStatus })
  @IsOptional()
  @IsEnum(TransferStatus)
  status?: TransferStatus;

  @ApiPropertyOptional({ description: 'Filter by source warehouse ID' })
  @IsOptional()
  @IsMongoId()
  sourceWarehouseId?: string;

  @ApiPropertyOptional({ description: 'Filter by destination warehouse ID' })
  @IsOptional()
  @IsMongoId()
  destinationWarehouseId?: string;
}
