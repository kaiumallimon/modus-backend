import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  BasePaginationQueryDto,
  TransformBooleanQuery,
} from '../../common/dto/pagination-query.dto';

export class WarehouseAddressDto {
  @ApiPropertyOptional({ example: '120 Logistics Pkwy' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  street?: string;

  @ApiPropertyOptional({ example: 'Austin' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'TX' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ example: '78701' })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  postalCode?: string;

  @ApiPropertyOptional({ example: 'USA' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;
}

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Main Distribution Center' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'WH-MAIN' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message:
      'Warehouse code may only contain letters, numbers, hyphens, and underscores',
  })
  code: string;

  @ApiPropertyOptional({ example: 'Primary central storage facility' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ type: WarehouseAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WarehouseAddressDto)
  address?: WarehouseAddressDto;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {}

export class QueryWarehouseDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean()
  isActive?: boolean;
}
