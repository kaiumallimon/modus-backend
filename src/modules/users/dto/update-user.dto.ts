import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Role } from '../enums/role.enum';

export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'Johnny',
    description: 'Updated first name',
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Smith',
    description: 'Updated last name',
  })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({
    example: Role.MANAGER,
    description:
      'Updated system or custom role code (strictly SUPER_ADMIN only)',
  })
  @IsOptional()
  @IsString()
  role?: string;
}
