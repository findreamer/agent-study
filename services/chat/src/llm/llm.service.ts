import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { getApiKeys } from '../config/api-keys.js';
import { createChatModel } from './model.factory.js';

export const SYSTEM_PROMPT =
  '你是需求结构化抽取助手，负责把用户输入的原始需求描述整理为结构清晰、要点完整的需求说明。';

@Injectable()
export class LlmService {
  chatModel(): ChatOpenAI {
    if (!getApiKeys().openAiApiKey) {
      throw new ServiceUnavailableException(
        'LLM 未就绪：请先在 services/chat/.env 中配置 OPENAI_API_KEY',
      );
    }
    return createChatModel();
  }

  buildMessages(input: string): [SystemMessage, HumanMessage] {
    return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(input)];
  }

  async invoke(input: string): Promise<string> {
    const response = await this.chatModel().invoke(this.buildMessages(input));
    return LlmService.textOf(response.content);
  }

  async *stream(input: string): AsyncGenerator<string> {
    const chunks = await this.chatModel().stream(this.buildMessages(input));
    for await (const chunk of chunks) {
      yield LlmService.textOf(chunk.content);
    }
  }

  private static textOf(content: BaseMessage['content']): string {
    return typeof content === 'string' ? content : JSON.stringify(content);
  }
}
