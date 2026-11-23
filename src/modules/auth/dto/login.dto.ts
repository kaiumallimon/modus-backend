import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'MOD-10492',
    description: 'User registered email address or human-readable ID (e.g. MOD-10492)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Email or User ID is required' })
  identifier: string;

  @ApiProperty({
    example: 'SecurePassword123!',
    description: 'User password (minimum 6 characters)',
  })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  @IsNotEmpty({ message: 'Password is required' })
  password: string;

  @ApiPropertyOptional({
    example: 'admin@modus.local',
    description: 'Optional alias for identifier (backward compatibility)',
  })
  @IsOptional()
  @IsString()
  email?: string;
}
