import { Module } from '@nestjs/common';
import { LlmModule } from './llm.module.js';
import { AdvancedController } from './advanced.controller.js';
import { AdvancedAnalysisService } from './advanced-analysis.service.js';

/**
 * 第四章能力统一入口模块。
 *
 * RunnableMemoryService / XenovaEmbeddings / VectorStoreService / FilesystemService /
 * AgentOrchestratorService 均由 LlmModule 提供并导出，这里通过 imports 引用同一批实例；
 * 不能在本模块再重复 providers 注册——那会创建第二套实例，
 * 内存会话 Map 与内存向量库都会分裂成两份（写入与查询对不上）。
 */
@Module({
  imports: [LlmModule],
  controllers: [AdvancedController],
  providers: [AdvancedAnalysisService],
  exports: [AdvancedAnalysisService],
})
export class AdvancedModule {}
