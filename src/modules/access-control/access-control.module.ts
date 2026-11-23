import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoleEntity, RoleSchema } from './schemas/role.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AccessControlService } from './access-control.service';
import { AccessControlController } from './access-control.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RoleEntity.name, schema: RoleSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuditLogModule,
  ],
  controllers: [AccessControlController],
  providers: [AccessControlService],
  exports: [AccessControlService, MongooseModule],
})
export class AccessControlModule {}
