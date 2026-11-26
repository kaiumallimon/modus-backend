import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  BasePaginationQueryDto,
  TransformBooleanQuery,
} from '../../common/dto/pagination-query.dto';

export class CreateUnitDto {
  @ApiProperty({ example: 'Kilogram' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: 'kg' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  symbol: string;

  @ApiPropertyOptional({ example: 'Metric mass unit (1000 grams)' })
  @IsString()
  @IsOptional()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateUnitDto extends PartialType(CreateUnitDto) {}

export class QueryUnitDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean()
  isActive?: boolean;
}
