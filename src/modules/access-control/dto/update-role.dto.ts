import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateRoleDto {
  @ApiPropertyOptional({
    example: 'Senior Sales Lead',
    description: 'Human-readable role display name',
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({
    example: 'Lead representative for customer operations',
    description: 'Role purpose description',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    example: ['users.read', 'modules.read'],
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
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
