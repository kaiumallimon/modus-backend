import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class LoginDto {
  @ApiPropertyOptional({
    example: 'MOD-91307',
    description:
      'User registered email address or human-readable ID (e.g. MOD-10492). Required if email is not provided.',
  })
  @ValidateIf((o: LoginDto) => !o.email)
  @IsNotEmpty({ message: 'Email or User ID is required' })
  @IsString({ message: 'Identifier must be a string' })
  identifier?: string;

  @ApiPropertyOptional({
    example: 'admin@modus.local',
    description:
      'User registered email address. Required if identifier is not provided.',
  })
  @ValidateIf((o: LoginDto) => !o.identifier)
  @IsNotEmpty({ message: 'Email or User ID is required' })
  @IsString({ message: 'Email must be a string' })
  email?: string;

  @ApiProperty({
    example: 'SuperAdminSecret123!',
    description: 'User password (minimum 6 characters)',
  })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}
