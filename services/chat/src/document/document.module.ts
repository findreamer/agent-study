import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { SseModule } from '../sse/sse.module.js';
import { DocumentController } from './document.controller.js';
import { DocumentService } from './document.service.js';
import { ChunkService } from './chunk.service.js';
import { DocumentEmbeddingService } from './embedding.service.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  // AuthModule 提供 JwtAuthGuard；LlmModule 提供 XenovaEmbeddings 单例（复用，不重复注册）；
  // SseModule 提供 SseService（事件先落 task_events 再实时推送）
  imports: [AuthModule, LlmModule, SseModule],
  controllers: [DocumentController, SearchController],
  providers: [DocumentService, ChunkService, DocumentEmbeddingService, SearchService],
})
export class DocumentModule {}
