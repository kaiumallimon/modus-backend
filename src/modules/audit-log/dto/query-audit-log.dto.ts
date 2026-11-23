import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryAuditLogDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'AUTH_LOGIN' })
  @IsString()
  @IsOptional()
  action?: string;

  @ApiPropertyOptional({ example: 'users' })
  @IsString()
  @IsOptional()
  resource?: string;

  @ApiPropertyOptional({ example: '64f1b2c3d4e5f6a7b8c9d0e1' })
  @IsString()
  @IsOptional()
  actorId?: string;

  @ApiPropertyOptional({ example: 'admin@example.com' })
  @IsString()
  @IsOptional()
  search?: string;
}
