import { Injectable } from '@nestjs/common';
import type { ChatOpenAI } from '@langchain/openai';
import { LlmService } from '../llm.service.js';
import { createSubAgents } from './sub-agents.js';

export interface AgentStep {
  agent: string;
  ok: boolean;
  durationMs: number;
  outputPreview: string;
}

export type OrchestrationStatus =
  | 'completed'
  | 'needs_clarification'
  | 'failed';

export interface OrchestrationResult {
  mode: 'fixed_workflow';
  status: OrchestrationStatus;
  clarificationQuestions: string[];
  usedAgents: string[];
  fallback: 'manual_review' | null;
  steps: AgentStep[];
  report: string | null;
}

/** 流式编排事件：stage 供前端推进度条，delta 是 Markdown Agent 的逐段输出 */
export type OrchestrationStreamEvent =
  | { type: 'stage'; agent: string; index: number; total: number; label: string; percent: number }
  | { type: 'delta'; text: string };

export const PIPELINE_TOTAL = 5;

const PIPELINE_LABELS: Record<string, string> = {
  extract: '需求提取',
  clarify: '澄清判断',
  analysis: '多维度分析',
  risk: '风险评估',
  summary: '综合报告',
};

const PREVIEW_LIMIT = 200;
const MAX_CLARIFY_QUESTIONS = 3;

/** 从模型输出中提取 JSON：容忍 markdown 代码围栏与前后缀文本。 */
function extractJson(raw: string): Record<string, unknown> {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error(`输出中不包含 JSON：${raw.slice(0, PREVIEW_LIMIT)}`);
  }
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}

function asQuestions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string' && value.trim()) {
    return [value];
  }
  return [];
}

function previewOf(output: unknown): string {
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  return (text ?? '').slice(0, PREVIEW_LIMIT);
}

@Injectable()
export class AgentOrchestratorService {
  constructor(private readonly llm: LlmService) {}

  /**
   * 固定编排：抽取 → 澄清判断 → 多维度分析 → 风险评估 → 综合报告。
   * retrievedContext 是检索增强上下文（会话历史 + 文档检索片段），
   * 非空时拼进输入，让每个 Agent 都能看到同一份背景；
   * 需要澄清时提前终止；任何环节失败走 manual_review 兜底。
   */
  async orchestrate(input: string, retrievedContext?: string): Promise<OrchestrationResult> {
    const generator = this.streamOrchestration(input, retrievedContext);
    let next = await generator.next();
    while (!next.done) next = await generator.next();
    return next.value;
  }

  /**
   * orchestrate 的流式版本，是编排的唯一实现：
   * 每个 Agent 开始前发 stage 事件（percent = index * 20），
   * Markdown Agent（analysis/risk/summary）逐段发 delta，
   * JSON Agent（extract/clarify）静默收集，只发进度。
   * 分析/风控由并行改为顺序执行，换取流式文本的确定性。
   */
  async *streamOrchestration(
    input: string,
    retrievedContext?: string,
  ): AsyncGenerator<OrchestrationStreamEvent, OrchestrationResult> {
    const agents = createSubAgents(this.chatModel());
    const steps: AgentStep[] = [];
    const usedAgents: string[] = [];
    const effectiveInput = retrievedContext?.trim()
      ? `${input}\n\n${retrievedContext}`
      : input;

    const stage = (agent: string, index: number): OrchestrationStreamEvent => ({
      type: 'stage',
      agent,
      index,
      total: PIPELINE_TOTAL,
      label: PIPELINE_LABELS[agent] ?? agent,
      percent: index * 20,
    });

    try {
      yield stage('extract', 0);
      const extracted = await this.runStep(
        'extract',
        async () => {
          const raw = (await agents.extractAgent.invoke({ input: effectiveInput })) as string;
          return JSON.stringify(extractJson(raw));
        },
        steps,
      );
      usedAgents.push('extract');

      yield stage('clarify', 1);
      const clarify = await this.runStep(
        'clarify',
        async () => {
          const raw = (await agents.clarifyAgent.invoke({
            input: effectiveInput,
            extracted,
          })) as string;
          return extractJson(raw);
        },
        steps,
      );
      usedAgents.push('clarify');
      if (clarify.needsClarification) {
        return {
          mode: 'fixed_workflow',
          status: 'needs_clarification',
          clarificationQuestions: asQuestions(clarify.questions).slice(
            0,
            MAX_CLARIFY_QUESTIONS,
          ),
          usedAgents,
          fallback: null,
          steps,
          report: null,
        };
      }

      yield stage('analysis', 2);
      let analysisRaw = '';
      const analysisStart = Date.now();
      try {
        for await (const delta of (await agents.analysisAgent.stream({
          input: effectiveInput,
          extracted,
        })) as AsyncIterable<string>) {
          if (!delta) continue;
          analysisRaw += delta;
          yield { type: 'delta', text: delta };
        }
        this.finalizeStep('analysis', analysisRaw, analysisStart, steps);
      } catch (error) {
        this.failStep('analysis', error, analysisStart, steps);
        throw error;
      }
      usedAgents.push('analysis');

      yield stage('risk', 3);
      let riskRaw = '';
      const riskStart = Date.now();
      try {
        for await (const delta of (await agents.riskAgent.stream({
          input: effectiveInput,
          extracted,
        })) as AsyncIterable<string>) {
          if (!delta) continue;
          riskRaw += delta;
          yield { type: 'delta', text: delta };
        }
        this.finalizeStep('risk', riskRaw, riskStart, steps);
      } catch (error) {
        this.failStep('risk', error, riskStart, steps);
        throw error;
      }
      usedAgents.push('risk');

      yield stage('summary', 4);
      let report = '';
      const summaryStart = Date.now();
      try {
        for await (const delta of (await agents.summaryAgent.stream({
          input: effectiveInput,
          extracted,
          analysis: analysisRaw,
          risk: riskRaw,
        })) as AsyncIterable<string>) {
          if (!delta) continue;
          report += delta;
          yield { type: 'delta', text: delta };
        }
        this.finalizeStep('summary', report, summaryStart, steps);
      } catch (error) {
        this.failStep('summary', error, summaryStart, steps);
        throw error;
      }
      usedAgents.push('summary');

      return {
        mode: 'fixed_workflow',
        status: 'completed',
        clarificationQuestions: [],
        usedAgents,
        fallback: null,
        steps,
        report,
      };
    } catch {
      return {
        mode: 'fixed_workflow',
        status: 'failed',
        clarificationQuestions: [],
        usedAgents,
        fallback: 'manual_review',
        steps,
        report: null,
      };
    }
  }

  private chatModel(): ChatOpenAI {
    // chatModel() 内部带 503 守卫：未配置密钥时快速失败，与其它路由行为一致
    return this.llm.chatModel();
  }

  /** 流式 Agent 消费完成后的落账与空输出校验，语义与 runStep 一致 */
  private finalizeStep(agent: string, output: string, start: number, steps: AgentStep[]): void {
    if (!output.trim()) {
      const error = new Error(`${agent} 返回空输出（可能是推理预算耗尽或上游异常）`);
      this.failStep(agent, error, start, steps);
      throw error;
    }
    steps.push({
      agent,
      ok: true,
      durationMs: Date.now() - start,
      outputPreview: previewOf(output),
    });
  }

  private failStep(agent: string, error: unknown, start: number, steps: AgentStep[]): void {
    steps.push({
      agent,
      ok: false,
      durationMs: Date.now() - start,
      outputPreview: String(error).slice(0, PREVIEW_LIMIT),
    });
  }

  private async runStep<T>(
    agent: string,
    run: () => Promise<T>,
    steps: AgentStep[],
  ): Promise<T> {
    const start = Date.now();
    try {
      const output = await run();
      // 思考型模型推理耗尽 maxTokens 时会返回空正文，必须按失败兜底而非静默透传
      if (output === null || output === undefined || (typeof output === 'string' && !output.trim())) {
        throw new Error(`${agent} 返回空输出（可能是推理预算耗尽或上游异常）`);
      }
      steps.push({
        agent,
        ok: true,
        durationMs: Date.now() - start,
        outputPreview: previewOf(output),
      });
      return output;
    } catch (error) {
      steps.push({
        agent,
        ok: false,
        durationMs: Date.now() - start,
        outputPreview: String(error).slice(0, PREVIEW_LIMIT),
      });
      throw error;
    }
  }
}
