import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller.js';
import { LlmService } from './llm.service.js';
import { RequirementService } from './requirement.service.js';
import { MemoryController } from './memory/memory.controller.js';
import { RunnableMemoryService } from './memory/runnable-memory.service.js';

@Module({
  controllers: [LlmController, MemoryController],
  providers: [LlmService, RequirementService, RunnableMemoryService],
  exports: [LlmService, RequirementService, RunnableMemoryService],
})
export class LlmModule {}
