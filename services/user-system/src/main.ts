import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { env } from './common/config/env.js';
import { configureApp } from './configure.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  await app.listen(env.PORT);

  console.log(`User system service running on http://localhost:${env.PORT}`);
}
await bootstrap();
