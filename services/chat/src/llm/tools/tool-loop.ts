import { ToolMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { StructuredTool } from '@langchain/core/tools';
import { textOf } from '../messages/text.js';

export const MAX_TOOL_ROUNDS = 3;

export interface ToolCallTrace {
  tool: string;
  args: Record<string, unknown>;
  result: string;
}

export interface ToolLoopResult {
  output: string;
  steps: ToolCallTrace[];
}

// 通用工具执行闭环：模型发起 tool_calls → 执行真实工具 → 回填 ToolMessage → 循环直到给出最终答复。
// 超过 maxRounds 轮护栏后强制无工具收尾；未知工具名返回占位提示而非中断。
export async function runToolLoop(options: {
  model: BaseChatModel;
  messages: BaseMessage[];
  tools: StructuredTool[];
  toolsByName: Record<string, StructuredTool>;
  maxRounds?: number;
}): Promise<ToolLoopResult> {
  const { model, messages, tools, toolsByName } = options;
  const maxRounds = options.maxRounds ?? MAX_TOOL_ROUNDS;
  const history = [...messages];
  const steps: ToolCallTrace[] = [];
  for (let round = 0; round < maxRounds; round += 1) {
    const bound = model.bindTools?.(tools) ?? model;
    const response = await bound.invoke(history);
    history.push(response);
    if (!response.tool_calls?.length) {
      return { output: textOf(response.content), steps };
    }
    for (const call of response.tool_calls) {
      const selected = toolsByName[call.name];
      const result = selected
        ? String(await selected.invoke(call.args as never))
        : `未知工具：${call.name}`;
      steps.push({ tool: call.name, args: call.args, result });
      history.push(
        new ToolMessage({
          content: result,
          name: call.name,
          tool_call_id: call.id ?? '',
        }),
      );
    }
  }
  const final = await model.invoke(history);
  return { output: textOf(final.content), steps };
}
