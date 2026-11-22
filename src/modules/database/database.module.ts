import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('database.uri'),
        dbName: config.getOrThrow<string>('database.name'),
      }),
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
