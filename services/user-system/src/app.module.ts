import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { AuditModule } from './common/audit/audit.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { AuthCoreModule } from './common/auth/auth-core.module.js';
import { AuthModule } from './modules/auth/auth.module.js';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    JwtModule.register({ global: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    AuthCoreModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
