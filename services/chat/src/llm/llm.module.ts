import { Module } from '@nestjs/common';
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

@Module({
  controllers: [LlmController, MemoryController, FilesController, EmbeddingController, AgentsController],
  providers: [
    LlmService,
    RequirementService,
    RunnableMemoryService,
    FilesystemService,
    XenovaEmbeddings,
    VectorStoreService,
    AgentOrchestratorService,
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
