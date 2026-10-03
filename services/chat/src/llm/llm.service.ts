import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ChatOpenAI } from '@langchain/openai';
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { getApiKeys } from '../config/api-keys.js';
import { createChatModel } from './model.factory.js';
import { REQUIREMENT_SYSTEM_PROMPT } from './prompts/requirement.prompt.js';
import { buildRequirementPrompt } from './requirement.prompt-builder.js';
import { requirementChain } from './requirement.chain.js';
import { basicTools, basicToolsByName } from './tools/basic.tools.js';

const TOOL_USAGE_HINT =
  '\n你可以先调用提供的工具校验约束、查询实体定义，再输出最终的需求说明。';

const MAX_TOOL_ROUNDS = 3;

export interface ToolCallTrace {
  tool: string;
  args: Record<string, unknown>;
  result: string;
}

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

  async bindToolsOnce(
    input: string,
  ): Promise<
    | { kind: 'tool_calls'; toolCalls: Array<{ name: string; args: Record<string, unknown> }> }
    | { kind: 'text'; output: string }
  > {
    const response = await this.chatModel()
      .bindTools(basicTools)
      .invoke(this.buildToolMessages(input));
    if (response.tool_calls?.length) {
      return {
        kind: 'tool_calls',
        toolCalls: response.tool_calls.map((call) => ({
          name: call.name,
          args: call.args,
        })),
      };
    }
    return { kind: 'text', output: LlmService.textOf(response.content) };
  }

  async runToolLoop(
    input: string,
  ): Promise<{ output: string; steps: ToolCallTrace[] }> {
    const messages: BaseMessage[] = this.buildToolMessages(input);
    const steps: ToolCallTrace[] = [];
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await this.chatModel()
        .bindTools(basicTools)
        .invoke(messages);
      messages.push(response);
      if (!response.tool_calls?.length) {
        return { output: LlmService.textOf(response.content), steps };
      }
      for (const call of response.tool_calls) {
        const selected = basicToolsByName[call.name];
        const result = selected
          ? String(await selected.invoke(call.args as never))
          : `未知工具：${call.name}`;
        steps.push({ tool: call.name, args: call.args, result });
        messages.push(
          new ToolMessage({
            content: result,
            name: call.name,
            tool_call_id: call.id ?? '',
          }),
        );
      }
    }
    const final = await this.chatModel().invoke(messages);
    return { output: LlmService.textOf(final.content), steps };
  }

  private buildToolMessages(input: string): [SystemMessage, HumanMessage] {
    return [
      new SystemMessage(`${REQUIREMENT_SYSTEM_PROMPT}${TOOL_USAGE_HINT}`),
      new HumanMessage(input),
    ];
  }

  private static textOf(content: BaseMessage['content']): string {
    return typeof content === 'string' ? content : JSON.stringify(content);
  }
}
