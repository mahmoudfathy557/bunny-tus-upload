import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as cors from 'cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend
  app.use(
    cors({
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'tus-resumable',
        'upload-offset',
        'upload-length',
        'upload-metadata',
        'x-requested-with',
      ],
      exposedHeaders: [
        'tus-resumable',
        'tus-version',
        'tus-max-size',
        'tus-extension',
        'upload-offset',
        'upload-expires',
        'location',
      ],
      credentials: true,
    }),
  );

  app.useGlobalPipes(new ValidationPipe());

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 NestJS Bunny.net TUS Server running on port ${port}`);
  console.log(`📁 Upload endpoint: http://localhost:${port}/uploads/`);
}
bootstrap();
