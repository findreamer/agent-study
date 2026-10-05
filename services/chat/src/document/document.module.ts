import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { DocumentController } from './document.controller.js';
import { DocumentService } from './document.service.js';
import { DocumentProcessService } from './document-process.service.js';

@Module({
  // AuthModule 提供 JwtAuthGuard；LlmModule 提供 XenovaEmbeddings（复用单例，不重复注册）
  imports: [AuthModule, LlmModule],
  controllers: [DocumentController],
  providers: [DocumentService, DocumentProcessService],
})
export class DocumentModule {}
