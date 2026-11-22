import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { Role } from '../enums/role.enum';

export class CreateUserDto {
  @ApiProperty({
    example: 'pharmacist@pharmbrew.com',
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
    enum: Role,
    example: Role.EMPLOYEE,
    description: 'Assigned system role',
  })
  @IsEnum(Role, {
    message: `Role must be one of: ${Object.values(Role).join(', ')}`,
  })
  @IsNotEmpty()
  role: Role;
}
