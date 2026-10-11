import { AIMessage, SystemMessage, HumanMessage } from '@langchain/core/messages';
import type { ChatOpenAI } from '@langchain/openai';
import { textOf } from '../messages/text.js';
import {
  Annotation,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { z } from 'zod';
import { createChatModel } from '../model.factory.js';
import { extractJson } from '../agents/json-output.js';
import { createSubAgents } from '../agents/sub-agents.js';

export type AnalysisIntent = 'analyze' | 'query' | 'chat';

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
 * intent 由 classifierNode 写入并决定路由；queryResponse/chatResponse 只在对应分支写入，
 * summary 由三个出口（summary/queryHandler/chatHandler）写入，保持旧接口"总有 summary"。
 * 注：LangGraph 不允许节点名与通道同名，故三个 Markdown 产物字段
 * 以 Text 后缀命名（analysisText/riskText/summaryText），分析链节点名保持
 * extract/clarify/analysis/risk/summary 与第六章 Agent 一一对应。
 */
export const RequirementAnalysisState = Annotation.Root({
  ...MessagesAnnotation.spec,
  input: Annotation<string>,
  retrievedContext: Annotation<string>,
  intent: Annotation<AnalysisIntent>({
    reducer: (_current, next) => next,
    default: () => 'analyze',
  }),
  extracted: Annotation<string>,
  clarified: Annotation<ClarifyResult>,
  analysisText: Annotation<string>,
  riskText: Annotation<string>,
  summaryText: Annotation<string>,
  queryResponse: Annotation<string>,
  chatResponse: Annotation<string>,
});

/** 检索上下文非空白时拼进输入，与 orchestrator.orchestrate 的 effectiveInput 同一套规则 */
function effectiveInputOf(state: typeof RequirementAnalysisState.State): string {
  const context = state.retrievedContext ?? '';
  return context.trim() ? `${state.input}\n\n${context}` : state.input;
}

// ---------------------------------------------------------------------------
// 意图分类：LLM 结构化输出优先，失败降级为关键词匹配
// ---------------------------------------------------------------------------

const IntentSchema = z.object({
  intent: z.enum(['analyze', 'query', 'chat']),
  reasoning: z.string().describe('一句话说明分类依据'),
});

const INTENT_CLASSIFIER_PROMPT = `你是需求分析系统的意图分类器，把用户输入分类为 analyze / query / chat 之一。

【analyze 需求分析】用户提供或描述一个新需求，希望系统进行完整分析。
关键特征：描述功能、场景、要开发或实现什么；常见开头："分析需求"、"提个需求"、"我需要"、"我想做一个"、"开发"、"实现"。
示例：
- "分析需求 REQ-20240315-001：开发在线问卷系统，支持多种题型，支持导出报告"（编号只是需求标签，冒号后是完整需求描述 → analyze）
- "我需要一个用户登录功能"
- "做一个购物车，支持批量结算"

【query 需求查询】用户在查询已有需求、任务或报告的状态与内容。
关键特征：出现需求编号且伴随查询动词；常见词："查询"、"查一下"、"状态"、"进度"、"看看"、"报告"、"结果"、"有没有问题"、"怎么样了"。
示例：
- "查询 REQ-20240315-001 的当前状态"
- "REQ-20240415-002 的进度如何"
- "看看 REQ-20240315-001 有没有什么问题"（编号 + 查询语义 → query）
- "查询 REQ-20240315-001 的风险分析报告"（"查询"是动作、"分析"只是报告名的一部分 → query）

【chat 闲聊】与业务无关的寒暄、情绪表达或闲聊。
关键特征：问候、天气、感谢、告别，不含需求编号与任何业务动作。
示例："你好，今天天气不错"、"谢谢啦"、"在吗"。

【优先级规则，逐条判断】
1. 输入含需求编号，且编号后跟冒号引出的完整需求描述（功能、场景等）→ analyze
2. 输入含需求编号且为查询/跟进语义 → query；编号存在但语义模糊（如"看看有没有问题"）→ query
3. 输入同时出现"查询"与"分析"字样 → query（查询动作优先，"分析"往往只是报告名）
4. 纯寒暄、无任何业务语义 → chat
5. 以上都无法覆盖时 → 默认 analyze

只依据用户输入判断，不要臆造需求编号之外的信息。`;

/** 关键词降级分类：规则顺序即优先级（编号优先 query，纯闲聊 chat，兜底 analyze） */
export function classifyByKeywords(input: string): AnalysisIntent {
  const REQ_NO = /REQ-\d{4,8}-\d{2,4}/i;
  const CHAT_WORDS = /你好|您好|在吗|天气|谢谢|再见|辛苦了|闲聊/;
  const QUERY_WORDS = /查询|查一下|查查|状态|进度|看看|有没有问题|怎么样了|报告|结果/;
  const ANALYZE_WORDS = /分析需求|提需求|新需求|我需要|我想做|开发|实现一个|做一个|帮我分析/;

  if (CHAT_WORDS.test(input) && !REQ_NO.test(input) && !QUERY_WORDS.test(input)) {
    return 'chat';
  }
  if (REQ_NO.test(input)) {
    // 编号 + 冒号引出的完整需求描述 → 提交分析（如 "分析需求 REQ-xxx：开发……"）
    if (ANALYZE_WORDS.test(input) && /[：:]/.test(input)) return 'analyze';
    return 'query';
  }
  if (QUERY_WORDS.test(input)) return 'query';
  if (CHAT_WORDS.test(input)) return 'chat';
  return 'analyze';
}

async function classifyByLlm(model: ChatOpenAI, input: string): Promise<AnalysisIntent> {
  const structured = model.withStructuredOutput(IntentSchema, {
    method: 'functionCalling',
  });
  const result = (await structured.invoke([
    new SystemMessage(INTENT_CLASSIFIER_PROMPT),
    new HumanMessage(input),
  ])) as { intent?: string };
  if (result?.intent !== 'analyze' && result?.intent !== 'query' && result?.intent !== 'chat') {
    throw new Error(`意图分类返回非法值：${JSON.stringify(result)}`);
  }
  return result.intent;
}

/** 助手型节点（query/chat）的通用调用：system 人设 + 用户输入，空输出按失败兜底 */
async function invokeAssistant(
  model: ChatOpenAI,
  system: string,
  input: string,
): Promise<string> {
  const message = await model.invoke([new SystemMessage(system), new HumanMessage(input)]);
  const content = textOf(message.content).trim();
  if (!content) {
    throw new Error('助手返回空输出（可能是推理预算耗尽或上游异常）');
  }
  return content;
}

/**
 * 基线迁移 + 意图路由（feat/LangGraph 第 2 节）：
 * START → classifier（结构化意图分类，失败降级关键词），
 * 条件边按 intent 分流：analyze 走第六章五段分析链，query/chat 走轻量助手后直达 END。
 * 分析链内部保持基线形态：clarify 判定需要澄清时走向 END（与旧链提前终止一致）。
 */
export function createAnalysisGraph(model?: ChatOpenAI) {
  const chatModel = model ?? createChatModel();
  const agents = createSubAgents(chatModel);

  const classifierNode = async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    try {
      const intent = await classifyByLlm(chatModel, state.input);
      return { intent };
    } catch {
      // 结构化分类不可用（模型不支持工具调用/输出非法/上游异常）→ 关键词降级，不阻塞流水线
      return { intent: classifyByKeywords(state.input) };
    }
  };

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

  const queryHandlerNode = async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const content = await invokeAssistant(chatModel, '你是需求查询助手', effectiveInputOf(state));
    // 不写 state.summary：'summary' 通道与分析链 summary 节点撞名不存在，
    // 兼容旧接口的 summary 由 runAnalysisGraph 在 DTO 层兜底
    return { queryResponse: content, messages: [new AIMessage(content)] };
  };

  const chatHandlerNode = async (
    state: typeof RequirementAnalysisState.State,
  ): Promise<Partial<typeof RequirementAnalysisState.State>> => {
    const content = await invokeAssistant(chatModel, '你是友好的AI助手', effectiveInputOf(state));
    return { chatResponse: content, messages: [new AIMessage(content)] };
  };

  const routeByIntent = (state: typeof RequirementAnalysisState.State): string =>
    state.intent === 'query' ? 'queryHandler' : state.intent === 'chat' ? 'chatHandler' : 'extract';

  const routeAfterClarify = (state: typeof RequirementAnalysisState.State): string =>
    state.clarified.needsClarification ? END : 'analysis';

  return new StateGraph(RequirementAnalysisState)
    .addNode('classifier', classifierNode)
    .addNode('extract', extractNode)
    .addNode('clarify', clarifyNode)
    .addNode('analysis', analysisNode)
    .addNode('risk', riskNode)
    .addNode('summary', summaryNode)
    .addNode('queryHandler', queryHandlerNode)
    .addNode('chatHandler', chatHandlerNode)
    .addEdge(START, 'classifier')
    .addConditionalEdges('classifier', routeByIntent)
    .addEdge('extract', 'clarify')
    .addConditionalEdges('clarify', routeAfterClarify)
    .addEdge('analysis', 'risk')
    .addEdge('risk', 'summary')
    .addEdge('queryHandler', END)
    .addEdge('chatHandler', END)
    .addEdge('summary', END)
    .compile();
}

/** runAnalysisGraph 各阶段的产物记账；query/chat 分支只记录对应步骤 */
export interface AnalysisGraphSteps {
  extract?: string;
  clarify?: string;
  analysis?: string;
  risk?: string;
  summary?: string;
  query?: string;
  chat?: string;
}

/**
 * runAnalysisGraph 的返回：最终 State 产物的展平视图（字段用业务名，
 * 不带 Text 后缀）+ 各阶段记账。query/chat 分支的 extracted/analysis/risk
 * 保持 undefined（节点未执行）；summary 恒有值（分析报告或助手响应）。
 */
export interface AnalysisGraphResult {
  input: string;
  retrievedContext: string;
  intent: AnalysisIntent;
  queryResponse?: string;
  chatResponse?: string;
  extracted?: string;
  clarified?: ClarifyResult;
  analysis?: string;
  risk?: string;
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
  const base = {
    input,
    retrievedContext,
    intent: state.intent,
    queryResponse: state.queryResponse,
    chatResponse: state.chatResponse,
    extracted: state.extracted,
    clarified,
    analysis: state.analysisText,
    risk: state.riskText,
    // 兼容旧接口：三个出口都写 summary，这里再兜一层底
    summary: state.summaryText ?? state.queryResponse ?? state.chatResponse ?? '',
  };
  if (state.intent === 'query') {
    return { ...base, steps: { query: state.queryResponse ?? '' } };
  }
  if (state.intent === 'chat') {
    return { ...base, steps: { chat: state.chatResponse ?? '' } };
  }
  return {
    ...base,
    steps: {
      extract: state.extracted ?? '',
      clarify: JSON.stringify(clarified),
      analysis: state.analysisText ?? '',
      risk: state.riskText ?? '',
      summary: state.summaryText ?? '',
    },
  };
}
