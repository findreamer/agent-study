import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import {
  RequirementResultSchema,
  type RequirementResult,
} from '@agent-study/contracts';
import { getApiKeys } from '../config/api-keys.js';
import { createChatModel } from './model.factory.js';
import {
  REQUIREMENT_SYSTEM_PROMPT,
  REQUIREMENT_USER_TEMPLATE,
} from './prompts/requirement.prompt.js';

@Injectable()
export class RequirementService {
  private readonly prompt = ChatPromptTemplate.fromMessages([
    ['system', REQUIREMENT_SYSTEM_PROMPT],
    ['human', REQUIREMENT_USER_TEMPLATE],
  ]);

  async extract(input: string): Promise<RequirementResult> {
    const messages = await this.prompt.formatMessages({ input });
    const structuredModel = this.structuredModel();
    return structuredModel.invoke(messages);
  }

  private structuredModel() {
    if (!getApiKeys().openAiApiKey) {
      throw new ServiceUnavailableException(
        'LLM 未就绪：请先在 services/chat/.env 中配置 OPENAI_API_KEY',
      );
    }
    // 方舟模型不支持 response_format: json_schema，改走 function calling（tools）协议
    return createChatModel().withStructuredOutput(RequirementResultSchema, {
      method: 'functionCalling',
    });
  }
}
