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
import { AddressDto } from '../../organization/dto/update-organization.dto';

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

export class OrganizationSetupDto {
  @ApiProperty({ example: 'Acme Corporation' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Acme Corporation Ltd.' })
  @IsString()
  @IsOptional()
  legalName?: string;

  @ApiProperty({ example: 'contact@acme.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+1-555-0100' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'https://acme.com' })
  @IsString()
  @IsOptional()
  website?: string;

  @ApiPropertyOptional({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  @IsOptional()
  address?: AddressDto;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: 'UTC', default: 'UTC' })
  @IsString()
  @IsOptional()
  timezone?: string;

  @ApiPropertyOptional({ example: 'en-US', default: 'en-US' })
  @IsString()
  @IsOptional()
  locale?: string;
}

export class InstallationSetupDto {
  @ApiProperty({ type: AdminSetupDto })
  @ValidateNested()
  @Type(() => AdminSetupDto)
  @IsNotEmpty()
  administrator: AdminSetupDto;

  @ApiProperty({ type: OrganizationSetupDto })
  @ValidateNested()
  @Type(() => OrganizationSetupDto)
  @IsNotEmpty()
  organization: OrganizationSetupDto;
}
