import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { BasePaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  MovementReferenceType,
  StockMovementType,
} from '../schemas/stock-movement.schema';

export class QueryStockMovementDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by product ID' })
  @IsOptional()
  @IsMongoId()
  productId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse ID' })
  @IsOptional()
  @IsMongoId()
  warehouseId?: string;

  @ApiPropertyOptional({ enum: StockMovementType })
  @IsOptional()
  @IsEnum(StockMovementType)
  movementType?: StockMovementType;

  @ApiPropertyOptional({ enum: MovementReferenceType })
  @IsOptional()
  @IsEnum(MovementReferenceType)
  referenceType?: MovementReferenceType;

  @ApiPropertyOptional({ description: 'Lookup by reference number or ID' })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional({ description: 'Inclusive start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Inclusive end date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
