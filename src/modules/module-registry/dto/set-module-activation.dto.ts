import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetModuleActivationDto {
  @ApiProperty({
    example: true,
    description: 'Whether the module should be activated or deactivated in this installation',
  })
  @IsBoolean()
  isActivated: boolean;
}
