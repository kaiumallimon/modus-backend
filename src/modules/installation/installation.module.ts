import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Installation,
  InstallationSchema,
} from './schemas/installation.schema';
import { InstallationService } from './installation.service';
import { InstallationController } from './installation.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Installation.name, schema: InstallationSchema },
    ]),
  ],
  controllers: [InstallationController],
  providers: [InstallationService],
  exports: [InstallationService],
})
export class InstallationModule {}
