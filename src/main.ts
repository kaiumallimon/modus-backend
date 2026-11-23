import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  app.enableCors({
    origin: config.get<string[]>('cors.origin'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableShutdownHooks();

  const apiPrefix = config.get<string>('app.apiPrefix', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  const swaggerConfig = new DocumentBuilder()
    .setTitle(config.get<string>('app.name', 'Modus'))
    .setDescription(
      'Modus — Self-hosted Business Management System API Documentation',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('app.port', 8000);
  await app.listen(port);

  logger.log(
    `Application is running on: http://localhost:${port}/${apiPrefix}`,
  );
  logger.log(
    `Swagger documentation available at: http://localhost:${port}/api/docs`,
  );
}
void bootstrap();
