import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { getApiKeys } from '../config/api-keys.js';
import { createChatModel } from './model.factory.js';
import { REQUIREMENT_SYSTEM_PROMPT } from './prompts/requirement.prompt.js';
import { buildRequirementPrompt } from './requirement.prompt-builder.js';
import { requirementChain } from './requirement.chain.js';

export interface PromptPreviewMessage {
  role: string;
  content: string;
}

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
    return [
      new SystemMessage(REQUIREMENT_SYSTEM_PROMPT),
      new HumanMessage(input),
    ];
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

  async batch(inputs: string[]): Promise<string[]> {
    const responses = await this.chatModel().batch(
      inputs.map((input) => this.buildMessages(input)),
    );
    return responses.map((response) => LlmService.textOf(response.content));
  }

  async previewRequirementPrompt(
    input: string,
  ): Promise<PromptPreviewMessage[]> {
    const messages = await buildRequirementPrompt().formatMessages({ input });
    return messages.map((message) => ({
      role: message.getType(),
      content: LlmService.textOf(message.content),
    }));
  }

  async invokeRequirementTemplate(input: string): Promise<string> {
    const messages = await buildRequirementPrompt().formatMessages({ input });
    const response = await this.chatModel().invoke(messages);
    return LlmService.textOf(response.content);
  }

  async invokeChain(input: string): Promise<string> {
    return requirementChain(this.chatModel()).invoke({ input });
  }

  async *streamChain(input: string): AsyncGenerator<string> {
    const stream = await requirementChain(this.chatModel()).stream({ input });
    for await (const delta of stream) {
      yield delta;
    }
  }

  async batchChain(inputs: string[]): Promise<string[]> {
    return requirementChain(this.chatModel()).batch(
      inputs.map((input) => ({ input })),
    );
  }

  private static textOf(content: BaseMessage['content']): string {
    return typeof content === 'string' ? content : JSON.stringify(content);
  }
}
