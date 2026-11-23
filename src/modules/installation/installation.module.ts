import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Installation,
  InstallationSchema,
} from './schemas/installation.schema';
import { InstallationService } from './installation.service';
import { InstallationController } from './installation.controller';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { AccessControlModule } from '../access-control/access-control.module';
import { OrganizationModule } from '../organization/organization.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { ModuleRegistryModule } from '../module-registry/module-registry.module';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Installation.name, schema: InstallationSchema },
    ]),
    UsersModule,
    AuthModule,
    AccessControlModule,
    OrganizationModule,
    SystemSettingsModule,
    ModuleRegistryModule,
    AuditLogModule,
  ],
  controllers: [InstallationController],
  providers: [InstallationService],
  exports: [InstallationService],
})
export class InstallationModule {}
