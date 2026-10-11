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
 * input 是流水线的原始需求；retrievedContext 是检索增强上下文（会话历史 + 文档检索片段），
 * 与 orchestrator 的 effectiveInput 语义一致：非空白时拼进输入，让每个 Agent 都能看到。
 * 注：LangGraph 不允许节点名与通道同名，故三个 Markdown 产物字段
 * 以 Text 后缀命名（analysisText/riskText/summaryText），节点名保持
 * extract/clarify/analysis/risk/summary 与第六章 Agent 一一对应。
 */
export const RequirementAnalysisState = Annotation.Root({
  ...MessagesAnnotation.spec,
  input: Annotation<string>,
  retrievedContext: Annotation<string>,
  extracted: Annotation<string>,
  clarified: Annotation<ClarifyResult>,
  analysisText: Annotation<string>,
  riskText: Annotation<string>,
  summaryText: Annotation<string>,
});

/** 检索上下文非空白时拼进输入，与 orchestrator.orchestrate 的 effectiveInput 同一套规则 */
function effectiveInputOf(state: typeof RequirementAnalysisState.State): string {
  const context = state.retrievedContext ?? '';
  return context.trim() ? `${state.input}\n\n${context}` : state.input;
}

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
    const raw = (await agents.extractAgent.invoke({ input: effectiveInputOf(state) })) as string;
    const extracted = JSON.stringify(extractJson(raw));
    return { extracted, messages: [new AIMessage(raw)] };
  };

  const clarifyNode = async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const raw = (await agents.clarifyAgent.invoke({
      input: effectiveInputOf(state),
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
      input: effectiveInputOf(state),
      extracted: state.extracted,
    })) as string;
    return { analysisText: analysis, messages: [new AIMessage(analysis)] };
  };

  const riskNode = async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const risk = (await agents.riskAgent.invoke({
      input: effectiveInputOf(state),
      extracted: state.extracted,
    })) as string;
    return { riskText: risk, messages: [new AIMessage(risk)] };
  };

  const summaryNode = async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const summary = (await agents.summaryAgent.invoke({
      input: effectiveInputOf(state),
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

/** runAnalysisGraph 各阶段的产物记账，字段形状与 OrchestrationResult.steps 的草稿对齐 */
export interface AnalysisGraphSteps {
  extract: string;
  clarify: string;
  analysis: string;
  risk: string;
  summary: string;
}

/**
 * runAnalysisGraph 的返回：最终 State 产物的展平视图（字段用业务名，
 * 不带 Text 后缀）+ 各阶段记账。clarify 提前终止时 analysis/risk/summary 为空串。
 */
export interface AnalysisGraphResult {
  input: string;
  retrievedContext: string;
  extracted: string;
  clarified: ClarifyResult;
  analysis: string;
  risk: string;
  summary: string;
  steps: AnalysisGraphSteps;
}

/** 与旧 Promise 链同名的入口：编译图并执行，返回展平结果与各阶段记账。 */
export async function runAnalysisGraph(
  input: string,
  retrievedContext = '',
): Promise<AnalysisGraphResult> {
  const graph = createAnalysisGraph();
  const state = await graph.invoke({ input, retrievedContext, messages: [] });
  const clarified = state.clarified ?? { needsClarification: false, questions: [] };
  return {
    input,
    retrievedContext,
    extracted: state.extracted ?? '',
    clarified,
    analysis: state.analysisText ?? '',
    risk: state.riskText ?? '',
    summary: state.summaryText ?? '',
    steps: {
      extract: state.extracted ?? '',
      clarify: JSON.stringify(clarified),
      analysis: state.analysisText ?? '',
      risk: state.riskText ?? '',
      summary: state.summaryText ?? '',
    },
  };
}
