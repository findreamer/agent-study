import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Module({
  imports: [
    // global：@UseGuards(JwtAuthGuard) 类引用的守卫在消费模块中实例化，
    // JwtService 必须全局可见
    JwtModule.register({
      global: true,
      // 与 user-system 共享的验签密钥；chat 只验签不签发
      secret: process.env['JWT_SECRET'] ?? '',
    }),
  ],
  providers: [JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
