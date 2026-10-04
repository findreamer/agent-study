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

@Module({
  controllers: [LlmController, MemoryController, FilesController, EmbeddingController],
  providers: [
    LlmService,
    RequirementService,
    RunnableMemoryService,
    FilesystemService,
    XenovaEmbeddings,
    VectorStoreService,
  ],
  exports: [
    LlmService,
    RequirementService,
    RunnableMemoryService,
    FilesystemService,
    XenovaEmbeddings,
    VectorStoreService,
  ],
})
export class LlmModule {}
