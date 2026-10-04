import type { ChatOpenAI } from '@langchain/openai';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  extractPrompt,
  clarifyPrompt,
  analysisPrompt,
  riskPrompt,
  summaryPrompt,
} from '../prompts/requirement.prompts.js';

/**
 * 五个需求分析子 Agent。
 * 统一形态：prompt.pipe(model).pipe(StringOutputParser)，
 * 输出一律是字符串，JSON 解析由编排器负责。
 */
export interface SubAgents {
  extractAgent: ReturnType<typeof extractPrompt.pipe>;
  clarifyAgent: ReturnType<typeof clarifyPrompt.pipe>;
  analysisAgent: ReturnType<typeof analysisPrompt.pipe>;
  riskAgent: ReturnType<typeof riskPrompt.pipe>;
  summaryAgent: ReturnType<typeof summaryPrompt.pipe>;
}

export function createSubAgents(model: ChatOpenAI): SubAgents {
  const parser = new StringOutputParser();
  return {
    extractAgent: extractPrompt.pipe(model).pipe(parser),
    clarifyAgent: clarifyPrompt.pipe(model).pipe(parser),
    analysisAgent: analysisPrompt.pipe(model).pipe(parser),
    riskAgent: riskPrompt.pipe(model).pipe(parser),
    summaryAgent: summaryPrompt.pipe(model).pipe(parser),
  };
}
