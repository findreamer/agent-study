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
   * 固定编排：抽取 → 澄清判断 → 并行（分析 + 风控）→ 汇总。
   * 需要澄清时提前终止；任何环节失败走 manual_review 兜底。
   */
  async orchestrate(input: string): Promise<OrchestrationResult> {
    const agents = createSubAgents(this.chatModel());
    const steps: AgentStep[] = [];
    const usedAgents: string[] = [];

    try {
      const extracted = await this.runStep(
        'extract',
        async () => {
          const raw = (await agents.extractAgent.invoke({ input })) as string;
          return JSON.stringify(extractJson(raw));
        },
        steps,
      );
      usedAgents.push('extract');

      const clarify = await this.runStep(
        'clarify',
        async () => {
          const raw = (await agents.clarifyAgent.invoke({
            input,
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

      // 分析与风控互不依赖，并行执行
      const [analysisRaw, riskRaw] = await Promise.all([
        this.runStep<string>(
          'analysis',
          () => agents.analysisAgent.invoke({ input, extracted }) as Promise<string>,
          steps,
        ),
        this.runStep<string>(
          'risk',
          () => agents.riskAgent.invoke({ input, extracted }) as Promise<string>,
          steps,
        ),
      ]);
      usedAgents.push('analysis', 'risk');

      const report = await this.runStep<string>(
        'summary',
        () =>
          agents.summaryAgent.invoke({
            input,
            extracted,
            analysis: analysisRaw,
            risk: riskRaw,
          }) as Promise<string>,
        steps,
      );
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
