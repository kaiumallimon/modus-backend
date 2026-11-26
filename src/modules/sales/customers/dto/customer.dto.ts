import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  BasePaginationQueryDto,
  TransformBooleanQuery,
} from '../../../inventory/common/dto/pagination-query.dto';

const PHONE_REGEX = /^[+]?[\d\s().-]{6,24}$/;
const CUSTOMER_CODE_REGEX = /^[A-Z0-9_-]{3,40}$/;

export class CustomerAddressDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;
}

export class CreateCustomerDto {
  @ApiPropertyOptional({
    example: 'CUS-ACME-001',
    description: 'Unique customer code. Auto-generated when omitted.',
  })
  @IsOptional()
  @ValidateIf((_, val) => val !== undefined && val !== null && val !== '')
  @IsString()
  @Matches(CUSTOMER_CODE_REGEX, {
    message:
      'Customer code must be 3-40 uppercase letters, digits, hyphens, or underscores',
  })
  code?: string;

  @ApiProperty({ example: 'Apex Retail Trading Co.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiProperty({ example: '+1 555 210 9900' })
  @IsString()
  @IsNotEmpty()
  @Matches(PHONE_REGEX, { message: 'Phone number format is invalid' })
  phone: string;

  @ApiPropertyOptional({ example: 'orders@apexretail.com' })
  @IsOptional()
  @ValidateIf((_, val) => val !== undefined && val !== null && val !== '')
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ type: CustomerAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerAddressDto)
  billingAddress?: CustomerAddressDto;

  @ApiPropertyOptional({ type: CustomerAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerAddressDto)
  shippingAddress?: CustomerAddressDto;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, val) => val !== undefined && val !== null && val !== '')
  @IsString()
  @Matches(CUSTOMER_CODE_REGEX, {
    message:
      'Customer code must be 3-40 uppercase letters, digits, hyphens, or underscores',
  })
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(PHONE_REGEX, { message: 'Phone number format is invalid' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, val) => val !== undefined && val !== null && val !== '')
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ type: CustomerAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerAddressDto)
  billingAddress?: CustomerAddressDto;

  @ApiPropertyOptional({ type: CustomerAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerAddressDto)
  shippingAddress?: CustomerAddressDto;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ArchiveCustomerDto {
  @ApiPropertyOptional({
    default: false,
    description: 'Set false to archive customer or true to restore active status',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QueryCustomerDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by active/archived customer status',
  })
  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: ['name', 'code', 'createdAt', 'updatedAt'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: 'name' | 'code' | 'createdAt' | 'updatedAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
