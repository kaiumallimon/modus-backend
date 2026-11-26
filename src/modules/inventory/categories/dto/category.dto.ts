import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  BasePaginationQueryDto,
  TransformBooleanQuery,
} from '../../common/dto/pagination-query.dto';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Medical Supplies' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'Consumables and general clinical supplies' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: '64f1b2c3d4e5f6a7b8c9d0e1',
    description: 'Optional parent category ID',
    nullable: true,
  })
  @IsOptional()
  @IsMongoId()
  parentCategoryId?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class QueryCategoryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Filter by parent category ID' })
  @IsOptional()
  @IsMongoId()
  parentCategoryId?: string;
}
