import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class CreateRoleDto {
  @ApiProperty({
    example: 'SALES_LEAD',
    description: 'Unique uppercase role code/slug',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Role code must contain only uppercase letters, numbers, and underscores',
  })
  code: string;

  @ApiProperty({
    example: 'Sales Lead',
    description: 'Human-readable role display name',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'Lead representative for sales operations',
    description: 'Role purpose description',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: ['users.read', 'organization.read'],
    description: 'List of permission identifiers granted to this role',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  @IsOptional()
  permissions?: string[];

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the role is active',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
