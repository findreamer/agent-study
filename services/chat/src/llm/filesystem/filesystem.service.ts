import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { getApiKeys } from '../../config/api-keys.js';
import { createChatModel } from '../model.factory.js';
import { businessTools, businessToolsByName } from '../tools/business.tools.js';
import { runToolLoop, type ToolLoopResult } from '../tools/tool-loop.js';

export const FILES_SYSTEM_PROMPT =
  '你是需求分析助手，工作目录是 workspace。你可以调用工具查询需求单详情（query_requirement）、阅读 workspace 内的规范文件（read_file）、把分析结论写入报告文件（write_file）。所有路径都是 workspace 内的相对路径，不带 workspace/ 前缀。需要事实依据时必须先调用工具，不要编造需求单内容。';

@Injectable()
export class FilesystemService {
  async chat(input: string): Promise<ToolLoopResult> {
    if (!getApiKeys().openAiApiKey) {
      throw new ServiceUnavailableException(
        'LLM 未就绪：请先在 services/chat/.env 中配置 OPENAI_API_KEY',
      );
    }
    return runToolLoop({
      model: createChatModel(),
      messages: [
        new SystemMessage(FILES_SYSTEM_PROMPT),
        new HumanMessage(input),
      ],
      tools: businessTools,
      toolsByName: businessToolsByName,
    });
  }
}
