// main.ts — NestJS bootstrap
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Bảo mật (NF1)
  app.use(helmet());
  app.use(compression());

  // Global validation pipe — tự động validate DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,        // strip unknown fields
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — chỉ cho phép frontend origin (KHÔNG dùng APP_URL vì đó là URL backend)
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Server running on port ${process.env.PORT ?? 3000}`);
}
bootstrap();
