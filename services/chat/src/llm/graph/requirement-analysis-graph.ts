import { AIMessage } from '@langchain/core/messages';
import type { ChatOpenAI } from '@langchain/openai';
import {
  Annotation,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { createChatModel } from '../model.factory.js';
import { extractJson } from '../agents/json-output.js';
import { createSubAgents } from '../agents/sub-agents.js';

export interface ClarifyResult {
  needsClarification: boolean;
  questions: unknown;
}

/**
 * 需求分析基线图的状态。
 * messages 复用 MessagesAnnotation（追加型 reducer），记录每个 Agent 的原始输出；
 * 其余业务字段为覆盖型 reducer：每个字段只有一个节点写入，后写即最终值。
 * input 是流水线的原始需求，extract 节点起所有 Agent 都以它为上下文。
 * 注：LangGraph 不允许节点名与通道同名，故三个 Markdown 产物字段
 * 以 Text 后缀命名（analysisText/riskText/summaryText），节点名保持
 * extract/clarify/analysis/risk/summary 与第六章 Agent 一一对应。
 */
export const RequirementAnalysisState = Annotation.Root({
  ...MessagesAnnotation.spec,
  input: Annotation<string>,
  extracted: Annotation<string>,
  clarified: Annotation<ClarifyResult>,
  analysisText: Annotation<string>,
  riskText: Annotation<string>,
  summaryText: Annotation<string>,
});

/**
 * 基线迁移（feat/LangGraph 第 1 节）：业务逻辑不动，把第六章的 Promise 链
 * 换成 StateGraph。五个节点一一对应 sub-agents.ts 的五个 Agent，
 * 节点内部复用原来的调用，只返回 Partial<State>。
 * 唯一的非线性点：clarify 判定需要澄清时直接走向 END（与旧链的提前终止一致），
 * 后续章节会把这个条件边升级为澄清循环 / interrupt。
 */
export function createAnalysisGraph(model?: ChatOpenAI) {
  const chatModel = model ?? createChatModel();
  const agents = createSubAgents(chatModel);

  const extractNode = async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const raw = (await agents.extractAgent.invoke({ input: state.input })) as string;
    const extracted = JSON.stringify(extractJson(raw));
    return { extracted, messages: [new AIMessage(raw)] };
  };

  const clarifyNode = async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const raw = (await agents.clarifyAgent.invoke({
      input: state.input,
      extracted: state.extracted,
    })) as string;
    const parsed = extractJson(raw);
    const clarified: ClarifyResult = {
      needsClarification: parsed.needsClarification === true,
      questions: parsed.questions,
    };
    return { clarified, messages: [new AIMessage(raw)] };
  };

  const analysisNode = async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const analysis = (await agents.analysisAgent.invoke({
      input: state.input,
      extracted: state.extracted,
    })) as string;
    return { analysisText: analysis, messages: [new AIMessage(analysis)] };
  };

  const riskNode = async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const risk = (await agents.riskAgent.invoke({
      input: state.input,
      extracted: state.extracted,
    })) as string;
    return { riskText: risk, messages: [new AIMessage(risk)] };
  };

  const summaryNode = async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const summary = (await agents.summaryAgent.invoke({
      input: state.input,
      extracted: state.extracted,
      analysis: state.analysisText,
      risk: state.riskText,
    })) as string;
    return { summaryText: summary, messages: [new AIMessage(summary)] };
  };

  const routeAfterClarify = (state: typeof RequirementAnalysisState.State): string =>
    state.clarified.needsClarification ? END : 'analysis';

  return new StateGraph(RequirementAnalysisState)
    .addNode('extract', extractNode)
    .addNode('clarify', clarifyNode)
    .addNode('analysis', analysisNode)
    .addNode('risk', riskNode)
    .addNode('summary', summaryNode)
    .addEdge(START, 'extract')
    .addEdge('extract', 'clarify')
    .addConditionalEdges('clarify', routeAfterClarify)
    .addEdge('analysis', 'risk')
    .addEdge('risk', 'summary')
    .addEdge('summary', END)
    .compile();
}

/** 与旧 Promise 链同名的入口：编译图并以原始需求为初始状态执行，返回最终 State。 */
export async function runAnalysisGraph(
  input: string,
): Promise<typeof RequirementAnalysisState.State> {
  const graph = createAnalysisGraph();
  return graph.invoke({ input, messages: [] });
}
