import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { env } from './common/config/env.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { TransformInterceptor } from './common/interceptors/transform.interceptor.js';

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  // CORS_ORIGIN 支持逗号分隔多个来源（admin-web 3003 / chat-web 3002）
  const origins = env.CORS_ORIGIN.split(',').map((origin) => origin.trim());
  app.enableCors({ origin: origins, credentials: true });
  app.use(cookieParser());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
}
