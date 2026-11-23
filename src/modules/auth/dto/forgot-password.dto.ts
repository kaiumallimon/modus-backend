import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'admin@modus.local',
    description: 'Registered email address or human-readable ID (e.g. MOD-10492)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Email or User ID is required' })
  identifier: string;
}
