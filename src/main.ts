import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable global validation pipe for DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strips away properties not defined in DTOs
      forbidNonWhitelisted: true, // Throws an error if non-whitelisted properties are sent
      transform: true, // Automatically transforms payloads to DTO instances
    }),
  );

  // Configure Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('Bunny.net TUS Upload API')
    .setDescription(
      'API for initiating TUS resumable uploads to Bunny.net Stream',
    )
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey', // Can be 'apiKey', 'http', 'oauth2', 'openIdConnect'
        name: 'X-API-KEY', // Name of the header where the API key is expected
        in: 'header', // Location of the API key (header, query, cookie)
      },
      'BunnyNetApiKey',
    ) // Arbitrary name for the security scheme
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document); // Access docs at /api-docs

  // Enable CORS if your client is on a different origin
  app.enableCors({
    origin: '*', // Adjust this to your client's origin in a production environment
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: ${await app.getUrl()}`);
  console.log(
    `Swagger documentation available at: ${await app.getUrl()}/api-docs`,
  );
}
bootstrap();
