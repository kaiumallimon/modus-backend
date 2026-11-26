import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './modules/health/health.module';
import { DatabaseModule } from './modules/database/database.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { MailModule } from './modules/mail/mail.module';
import { InstallationModule } from './modules/installation/installation.module';
import { AccessControlModule } from './modules/access-control/access-control.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { SystemSettingsModule } from './modules/system-settings/system-settings.module';
import { ModuleRegistryModule } from './modules/module-registry/module-registry.module';
import { StorageModule } from './modules/storage/storage.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { SalesModule } from './modules/sales/sales.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProduction =
          config.get<string>('app.environment') === 'production';
        return {
          pinoHttp: {
            level: isProduction ? 'info' : 'debug',
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    singleLine: true,
                    translateTime: 'SYS:standard',
                  },
                },
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.passwordHash',
              'req.body.refreshToken',
              'req.body.accessToken',
              'body.password',
              'body.passwordHash',
              'body.refreshToken',
              'body.accessToken',
            ],
            autoLogging: {
              ignore: (req) =>
                Boolean(
                  req.url?.includes('/health') || req.url?.includes('/docs'),
                ),
            },
          },
        };
      },
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
    }),
    HealthModule,
    DatabaseModule,
    MailModule,
    UsersModule,
    AuthModule,
    InstallationModule,
    AccessControlModule,
    AuditLogModule,
    SystemSettingsModule,
    ModuleRegistryModule,
    StorageModule,
    InventoryModule,
    ProcurementModule,
    SalesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
