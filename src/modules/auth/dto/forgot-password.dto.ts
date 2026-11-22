import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'admin@pharmbrew.com',
    description: 'Registered email address or human-readable ID (e.g. PB-10492)',
  })
  @IsString()
  @IsNotEmpty({ message: 'Email or User ID is required' })
  identifier: string;
}
