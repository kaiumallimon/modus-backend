import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { BasePaginationQueryDto } from '../../../inventory/common/dto/pagination-query.dto';

export enum SupplierTransactionType {
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  GOODS_RECEIPT = 'GOODS_RECEIPT',
}

export class QuerySupplierTransactionsDto extends BasePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  supplierId?: string;

  @ApiPropertyOptional({ enum: SupplierTransactionType })
  @IsOptional()
  @IsEnum(SupplierTransactionType)
  type?: SupplierTransactionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
