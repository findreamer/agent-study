/**
 * 意图路由端到端验证脚本（真实模型）。
 * 运行：cd services/chat && bun run src/llm/graph/test-graph.ts
 *
 * 7 个用例覆盖 analyze / query / chat 三条路径：
 * - 意图分类准确率达标线 ≥ 6/7（85%）
 * - query/chat 只走 classifier + 对应 handler，响应时间应显著快于完整分析
 * - Case 1 走完整五段分析链，耗时以分钟计属正常
 */
import 'dotenv/config';
import { runAnalysisGraph } from './requirement-analysis-graph.js';
import type { AnalysisGraphResult, AnalysisIntent } from './requirement-analysis-graph.js';

interface CaseSpec {
  id: number;
  name: string;
  input: string;
  intents: AnalysisIntent[];
  note?: string;
  validate?: (result: AnalysisGraphResult, elapsedMs: number) => string | null;
}

const CASES: CaseSpec[] = [
  {
    id: 1,
    name: '完整需求分析',
    input: '分析需求 REQ-20240315-001：开发在线问卷系统，支持多种题型，支持逻辑跳转，支持导出报告',
    intents: ['analyze'],
    note: '走完整五段分析链，耗时以分钟计属正常',
    validate: (r) => {
      if (!r.extracted) return 'extracted 为空';
      if (!r.clarified) return 'clarified 为空';
      if (!r.analysis || !r.risk || !r.summary) return 'analysis/risk/summary 存在空值';
      return null;
    },
  },
  {
    id: 2,
    name: '需求状态查询',
    input: '查询 REQ-20240315-001 的当前状态',
    intents: ['query'],
    validate: (r) => {
      if (!r.queryResponse) return 'queryResponse 为空';
      if (r.extracted !== undefined || r.analysis !== undefined || r.risk !== undefined) {
        return '业务节点被触发（extracted/analysis/risk 应为 undefined）';
      }
      return null;
    },
  },
  {
    id: 3,
    name: '普通闲聊',
    input: '你好，今天天气不错',
    intents: ['chat'],
    note: '响应时间应 < 5000ms（仅 classifier + chatHandler 两次调用）',
    validate: (r, elapsed) => {
      if (!r.chatResponse) return 'chatResponse 为空';
      if (r.extracted !== undefined || r.analysis !== undefined) return '业务节点被触发';
      if (elapsed >= 5000) return `响应 ${elapsed}ms ≥ 5000ms`;
      return null;
    },
  },
  {
    id: 4,
    name: '模糊意图',
    input: '看看 REQ-20240315-001 有没有什么问题',
    intents: ['analyze', 'query'],
    note: '编号优先 query，判成 analyze 也算通过（能明确选边、不卡住即可）',
  },
  {
    id: 5,
    name: '带编号的查询',
    input: 'REQ-20240415-002 的进度如何',
    intents: ['query'],
    note: '需求编号优先级高',
  },
  {
    id: 6,
    name: '简短需求',
    input: '我需要一个用户登录功能',
    intents: ['analyze'],
    validate: (r) => (!r.summary ? 'summary 为空' : null),
  },
  {
    id: 7,
    name: '多重含义',
    input: '查询 REQ-20240315-001 的风险分析报告',
    intents: ['query'],
    note: '"查询"动作优先于"分析"字样',
  },
];

async function main(): Promise<void> {
  console.log('== LangGraph 意图路由端到端验证（真实模型）==\n');
  let pass = 0;
  const times: Record<string, number> = {};

  for (const spec of CASES) {
    const started = Date.now();
    let line: string;
    try {
      const result = await runAnalysisGraph(spec.input);
      const elapsed = Date.now() - started;
      times[`case${spec.id}`] = elapsed;
      const intentOk = spec.intents.includes(result.intent);
      const extra = spec.validate?.(result, elapsed) ?? null;
      const path = Object.keys(result.steps).join('+') || '(无)';
      if (intentOk && !extra) {
        pass += 1;
        line = `[PASS] Case ${spec.id} ${spec.name} | intent=${result.intent} | 路径=${path} | ${elapsed}ms`;
      } else {
        line = `[FAIL] Case ${spec.id} ${spec.name} | intent=${result.intent}（期望 ${spec.intents.join('/')}）| 路径=${path} | ${elapsed}ms${extra ? ` | ${extra}` : ''}`;
      }
    } catch (error) {
      const elapsed = Date.now() - started;
      line = `[FAIL] Case ${spec.id} ${spec.name} | 异常：${String(error).slice(0, 160)} | ${elapsed}ms`;
    }
    console.log(line);
  }

  const queryMs = times.case2 ?? 0;
  const chatMs = times.case3 ?? 0;
  const analyzeMs = times.case1 ?? 0;
  console.log(
    `\n耗时对比：query=${queryMs}ms chat=${chatMs}ms 完整分析=${analyzeMs}ms` +
      (analyzeMs > 0 ? '（query/chat 应显著更快）' : ''),
  );
  console.log(`\n通过 ${pass}/${CASES.length}（达标线 ≥ 6，即 85%）→ ${pass >= 6 ? '通过 ✅' : '未达标 ❌'}`);
  if (pass < 6) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(
    '脚本执行失败（未配置 OPENAI_API_KEY 或网络异常）：',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 2;
});
