import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export function transformBooleanQuery({ value }: { value: unknown }) {
  if (value === 'true' || value === true || value === 1 || value === '1') {
    return true;
  }
  if (value === 'false' || value === false || value === 0 || value === '0') {
    return false;
  }
  return value;
}

export const TransformBooleanQuery = () => Transform(transformBooleanQuery);

export class BasePaginationQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;

  @ApiPropertyOptional({ description: 'Search text filter' })
  @IsOptional()
  @IsString()
  search?: string;
}
