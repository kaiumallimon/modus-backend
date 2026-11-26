import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
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

export class SupplierAddressDto {
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

export class SupplierContactDto {
  @ApiProperty({ example: 'Ayesha Rahman' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'Account Manager' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  role?: string;

  @ApiPropertyOptional({ example: 'ayesha@supplier.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+1 555 201 8844' })
  @IsOptional()
  @Matches(PHONE_REGEX, { message: 'Contact phone format is invalid' })
  phone?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateSupplierDto {
  @ApiProperty({ example: 'MediCore Pharmaceuticals Ltd.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @ApiProperty({ example: 'SUP-MEDICORE' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message:
      'Supplier code may only contain letters, numbers, hyphens, and underscores',
  })
  code: string;

  @ApiProperty({ example: 'Sarah Jenkins' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  contactPerson: string;

  @ApiProperty({ example: 'orders@medicore.example' })
  @IsEmail({}, { message: 'Valid supplier email is required' })
  email: string;

  @ApiProperty({ example: '+1 555 014 7788' })
  @Matches(PHONE_REGEX, { message: 'Valid supplier phone number is required' })
  phone: string;

  @ApiPropertyOptional({ example: '+1 555 014 7799' })
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim() !== '')
  @Matches(PHONE_REGEX, { message: 'Alternative phone format is invalid' })
  alternativePhone?: string;

  @ApiPropertyOptional({ type: SupplierAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SupplierAddressDto)
  address?: SupplierAddressDto;

  @ApiPropertyOptional({ example: 'https://medicore.example' })
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim() !== '')
  @IsUrl(
    { require_protocol: true },
    { message: 'Website must be a valid URL starting with http:// or https://' },
  )
  website?: string;

  @ApiPropertyOptional({ example: 'TIN-9482011' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ type: [SupplierContactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierContactDto)
  contacts?: SupplierContactDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSupplierDto {
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
  @MaxLength(40)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message:
      'Supplier code may only contain letters, numbers, hyphens, and underscores',
  })
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  contactPerson?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Valid supplier email is required' })
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(PHONE_REGEX, { message: 'Valid supplier phone number is required' })
  phone?: string;

  @ApiPropertyOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim() !== '')
  @Matches(PHONE_REGEX, { message: 'Alternative phone format is invalid' })
  alternativePhone?: string;

  @ApiPropertyOptional({ type: SupplierAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SupplierAddressDto)
  address?: SupplierAddressDto;

  @ApiPropertyOptional()
  @ValidateIf((_, v) => v !== undefined && v !== null && String(v).trim() !== '')
  @IsUrl(
    { require_protocol: true },
    { message: 'Website must be a valid URL starting with http:// or https://' },
  )
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ type: [SupplierContactDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierContactDto)
  contacts?: SupplierContactDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class QuerySupplierDto extends BasePaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @TransformBooleanQuery()
  @IsBoolean()
  isActive?: boolean;
}
