import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as cors from 'cors';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'; // Import Swagger modules

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
        'x-api-key',
      ],
      exposedHeaders: [
        'tus-resumable',
        'tus-version',
        'tus-max-size',
        'tus-extension',
        'upload-offset',
        'upload-expires',
        'location',
        'Upload-Length',
        'Tus-Extension',
        'Upload-Concat',
      ],
      credentials: true,
    }),
  );

  app.useGlobalPipes(new ValidationPipe());

  // Configure Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('Bunny.net TUS Proxy API')
    .setDescription('API for TUS resumable uploads proxied to Bunny.net Stream')
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-KEY', // Name of the header where the API key is expected
        in: 'header', // Location of the API key (header, query, cookie)
      },
      'BunnyNetApiKey',
    ) // Arbitrary name for the security scheme
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document); // Access docs at /api-docs

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 NestJS Bunny.net TUS Server running on port ${port}`);
  console.log(`📁 Upload endpoint: http://localhost:${port}/uploads/`);
  console.log(
    `📚 Swagger documentation available at: http://localhost:${port}/api-docs`,
  );
}
bootstrap();
