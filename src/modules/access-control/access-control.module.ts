import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoleEntity, RoleSchema } from './schemas/role.schema';
import { AccessControlService } from './access-control.service';
import { AccessControlController } from './access-control.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RoleEntity.name, schema: RoleSchema },
    ]),
  ],
  controllers: [AccessControlController],
  providers: [AccessControlService],
  exports: [AccessControlService, MongooseModule],
})
export class AccessControlModule {}
