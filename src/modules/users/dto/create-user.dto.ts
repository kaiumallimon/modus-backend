import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { Role } from '../enums/role.enum';

export class CreateUserDto {
  @ApiProperty({
    example: 'user@modus.local',
    description: 'Unique and deliverable email address for the user',
  })
  @IsEmail({}, { message: 'Must be a valid email address' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'John',
    description: 'First name',
  })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    example: 'Doe',
    description: 'Last name',
  })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    example: Role.EMPLOYEE,
    description:
      'Assigned system or custom role code (e.g. SUPER_ADMIN, ADMIN, MANAGER, EMPLOYEE, or custom role code)',
  })
  @IsString()
  @IsNotEmpty()
  role: string;
}
