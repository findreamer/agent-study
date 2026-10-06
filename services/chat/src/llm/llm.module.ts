import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LlmController } from './llm.controller.js';
import { LlmService } from './llm.service.js';
import { RequirementService } from './requirement.service.js';
import { MemoryController } from './memory/memory.controller.js';
import { RunnableMemoryService } from './memory/runnable-memory.service.js';
import { FilesController } from './filesystem/files.controller.js';
import { FilesystemService } from './filesystem/filesystem.service.js';
import { XenovaEmbeddings } from './embedding/embedding.service.js';
import { VectorStoreService } from './embedding/vector-store.service.js';
import { EmbeddingController } from './embedding/embedding.controller.js';
import { AgentsController } from './agents/agents.controller.js';
import { AgentOrchestratorService } from './agents/orchestrator.service.js';
import { UiChatController } from './ui-protocol/ui-chat.controller.js';
import { UiResponseService } from './ui-protocol/ui-response.service.js';
import { UiFlowService } from './ui-protocol/ui-flow.service.js';

@Module({
  // UiChatController 带 JwtAuthGuard，守卫实例化需要 AuthModule
  imports: [AuthModule],
  controllers: [LlmController, MemoryController, FilesController, EmbeddingController, AgentsController, UiChatController],
  providers: [
    LlmService,
    RequirementService,
    RunnableMemoryService,
    FilesystemService,
    XenovaEmbeddings,
    VectorStoreService,
    AgentOrchestratorService,
    UiResponseService,
    UiFlowService,
  ],
  exports: [
    LlmService,
    RequirementService,
    RunnableMemoryService,
    FilesystemService,
    XenovaEmbeddings,
    VectorStoreService,
    AgentOrchestratorService,
  ],
})
export class LlmModule {}
