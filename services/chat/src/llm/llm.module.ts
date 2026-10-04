import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller.js';
import { LlmService } from './llm.service.js';
import { RequirementService } from './requirement.service.js';
import { MemoryController } from './memory/memory.controller.js';
import { RunnableMemoryService } from './memory/runnable-memory.service.js';
import { FilesController } from './filesystem/files.controller.js';
import { FilesystemService } from './filesystem/filesystem.service.js';

@Module({
  controllers: [LlmController, MemoryController, FilesController],
  providers: [LlmService, RequirementService, RunnableMemoryService, FilesystemService],
  exports: [LlmService, RequirementService, RunnableMemoryService, FilesystemService],
})
export class LlmModule {}
