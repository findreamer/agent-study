import { Module } from '@nestjs/common';
import { LlmModule } from './llm.module.js';
import { DocumentModule } from '../document/document.module.js';
import { MessageModule } from '../message/message.module.js';
import { AdvancedController } from './advanced.controller.js';
import { AdvancedAnalysisService } from './advanced-analysis.service.js';

/**
 * 多 Agent 分析统一入口模块。
 *
 * RunnableMemoryService / AgentOrchestratorService 由 LlmModule 提供并导出；
 * SearchService 由 DocumentModule 提供（pgvector 语义检索，按 userId 隔离）；
 * MessageService 由 MessageModule 提供（会话历史与结论落库）。
 * 均通过 imports 引用同一批实例，本模块不重复注册 provider。
 */
@Module({
  imports: [LlmModule, DocumentModule, MessageModule],
  controllers: [AdvancedController],
  providers: [AdvancedAnalysisService],
  exports: [AdvancedAnalysisService],
})
export class AdvancedModule {}
