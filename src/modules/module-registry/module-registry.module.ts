import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ModuleRegistration,
  ModuleRegistrationSchema,
} from './schemas/module-registration.schema';
import { ModuleRegistryService } from './module-registry.service';
import { ModuleRegistryController } from './module-registry.controller';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ModuleRegistration.name, schema: ModuleRegistrationSchema },
    ]),
    AccessControlModule,
    AuditLogModule,
  ],
  controllers: [ModuleRegistryController],
  providers: [ModuleRegistryService],
  exports: [ModuleRegistryService, MongooseModule],
})
export class ModuleRegistryModule {}
