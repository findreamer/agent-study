import { Module } from '@nestjs/common';
import { MessageService } from './message.service.js';

/** messages 表读写：会话模块与统一分析服务共用同一实例 */
@Module({
  providers: [MessageService],
  exports: [MessageService],
})
export class MessageModule {}
