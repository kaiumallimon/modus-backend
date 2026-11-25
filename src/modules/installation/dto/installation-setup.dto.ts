import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AdminSetupDto {
  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SuperSecurePassword123!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;
}

export class SystemSetupDto {
  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsString()
  @IsOptional()
  defaultCurrency?: string;

  @ApiPropertyOptional({ example: 'UTC', default: 'UTC' })
  @IsString()
  @IsOptional()
  defaultTimezone?: string;

  @ApiPropertyOptional({ example: 'en-US', default: 'en-US' })
  @IsString()
  @IsOptional()
  defaultLocale?: string;
}

export class InstallationSetupDto {
  @ApiProperty({ type: AdminSetupDto })
  @ValidateNested()
  @Type(() => AdminSetupDto)
  @IsNotEmpty()
  administrator: AdminSetupDto;

  @ApiPropertyOptional({ type: SystemSetupDto })
  @ValidateNested()
  @Type(() => SystemSetupDto)
  @IsOptional()
  settings?: SystemSetupDto;
}
