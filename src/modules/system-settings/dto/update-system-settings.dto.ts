import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateSystemSettingsDto {
  @ApiPropertyOptional({ example: 'UTC' })
  @IsString()
  @IsOptional()
  defaultTimezone?: string;

  @ApiPropertyOptional({ example: 'en-US' })
  @IsString()
  @IsOptional()
  defaultLocale?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsString()
  @IsOptional()
  defaultCurrency?: string;

  @ApiPropertyOptional({ example: 'YYYY-MM-DD' })
  @IsString()
  @IsOptional()
  dateFormat?: string;

  @ApiPropertyOptional({ example: 'HH:mm:ss' })
  @IsString()
  @IsOptional()
  timeFormat?: string;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  defaultPaginationLimit?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  allowPasswordReset?: boolean;

  @ApiPropertyOptional({ example: 60, minimum: 5, maximum: 1440 })
  @IsInt()
  @Min(5)
  @Max(1440)
  @IsOptional()
  sessionTimeoutMinutes?: number;

  @ApiPropertyOptional({
    example: { theme: 'dark', compactView: true },
    description: 'Extensible application preferences (secrets prohibited)',
  })
  @IsObject()
  @IsOptional()
  customPreferences?: Record<string, any>;
}
