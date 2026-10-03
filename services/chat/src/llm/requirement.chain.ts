import { StringOutputParser } from '@langchain/core/output_parsers';
import type { ChatOpenAI } from '@langchain/openai';
import { buildRequirementPrompt } from './requirement.prompt-builder.js';

const requirementPrompt = buildRequirementPrompt();

// 模型按需创建（令牌缺失时不可在模块加载期实例化），
// 因此链以「模型 → 链」的构建函数导出，结构固定为 prompt → model → parser。
export const requirementChain = (model: ChatOpenAI) =>
  requirementPrompt.pipe(model).pipe(new StringOutputParser());
