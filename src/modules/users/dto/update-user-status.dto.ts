import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class UpdateUserStatusDto {
  @ApiProperty({
    example: false,
    description:
      'Target account active status (true to activate, false to deactivate)',
  })
  @IsBoolean()
  @IsNotEmpty()
  isActive: boolean;
}
