import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({
    example: 'MANAGER',
    description:
      'Role code to assign to the user (e.g. SUPER_ADMIN, ADMIN, MANAGER, EMPLOYEE, or custom role code)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z0-9_]+$/, {
    message: 'Role code must contain only uppercase letters, numbers, and underscores',
  })
  role: string;
}
