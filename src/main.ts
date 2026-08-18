import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { RedisService } from './redis/redis.service';
import { RedisIoAdapter } from './redis/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Redis pub/sub adapter lets Socket.IO broadcast events across multiple
  // server instances, so "online users" and chat messages stay in sync
  // even when clients are connected to different processes/pods.
  const redisService = app.get(RedisService);
  app.useWebSocketAdapter(
    new RedisIoAdapter(app, redisService.client, redisService.duplicate()),
  );

  // Strip unknown fields and auto-transform payloads to DTO types
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Live Event Platform API')
    .setDescription('REST + WebSocket API for events, chat and notifications')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Swagger docs available at http://localhost:${port}/docs`);
}
bootstrap();
