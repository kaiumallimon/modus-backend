import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsOptional } from 'class-validator';
import { BasePaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class QueryStockDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by product ID' })
  @IsOptional()
  @IsMongoId()
  productId?: string;

  @ApiPropertyOptional({ description: 'Filter by warehouse ID' })
  @IsOptional()
  @IsMongoId()
  warehouseId?: string;

  @ApiPropertyOptional({
    enum: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'],
    description: 'Filter by computed stock status against product threshold',
  })
  @IsOptional()
  @IsIn(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'])
  stockStatus?: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
}
