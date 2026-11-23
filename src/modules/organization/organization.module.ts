import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  OrganizationSettings,
  OrganizationSettingsSchema,
} from './schemas/organization.schema';
import { OrganizationService } from './organization.service';
import { OrganizationController } from './organization.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrganizationSettings.name, schema: OrganizationSettingsSchema },
    ]),
    AuditLogModule,
  ],
  controllers: [OrganizationController],
  providers: [OrganizationService],
  exports: [OrganizationService, MongooseModule],
})
export class OrganizationModule {}
