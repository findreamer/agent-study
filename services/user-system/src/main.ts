import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3003',
    credentials: true,
  });
  const port = process.env.PORT ?? 4002;

  await app.listen(port);

  console.log(`User system service running on http://localhost:${port}`);
}
await bootstrap();
