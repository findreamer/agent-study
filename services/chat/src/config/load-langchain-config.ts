import { readFileSync } from 'node:fs';
import path from 'node:path';
import { load as loadYaml } from 'js-yaml';

export interface LlmRunConfig {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface RetrievalConfig {
  enabled: boolean;
  topK: number;
}

export interface LangchainConfig {
  llm: LlmRunConfig;
  retrieval: RetrievalConfig;
  tools: Record<string, boolean>;
  features: Record<string, boolean>;
}

export function langchainConfigPath(): string {
  return (
    process.env.LANGCHAIN_CONFIG_PATH ??
    path.resolve(process.cwd(), 'config/langchain.yaml')
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`langchain.yaml 配置错误：${message}`);
  }
}

function assertPositiveInt(value: unknown, label: string): asserts value is number {
  assert(
    typeof value === 'number' && Number.isInteger(value) && value > 0,
    `${label} 必须是正整数`,
  );
}

function assertBooleanMap(value: unknown, label: string): asserts value is Record<string, boolean> {
  assert(
    value !== undefined &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value),
    `${label} 必须是对象`,
  );
  for (const [key, item] of Object.entries(value)) {
    assert(typeof item === 'boolean', `${label}.${key} 必须是布尔值`);
  }
}

export function loadLangchainConfig(): LangchainConfig {
  const raw = loadYaml(
    readFileSync(langchainConfigPath(), 'utf-8'),
  ) as Record<string, unknown>;
  assert(raw !== undefined && typeof raw === 'object', '根节点必须是对象');

  const llm = raw.llm as Partial<LlmRunConfig> | undefined;
  assert(llm !== undefined, '缺少 llm 配置');
  assert(
    typeof llm.provider === 'string' && llm.provider.length > 0,
    'llm.provider 必须是非空字符串',
  );
  assert(typeof llm.model === 'string' && llm.model.length > 0, 'llm.model 必须是非空字符串');
  assert(
    typeof llm.temperature === 'number' && llm.temperature >= 0 && llm.temperature <= 2,
    'llm.temperature 必须是 0~2 的数字',
  );
  assertPositiveInt(llm.maxTokens, 'llm.maxTokens');
  assertPositiveInt(llm.timeoutMs, 'llm.timeoutMs');

  const retrieval = raw.retrieval as Partial<RetrievalConfig> | undefined;
  assert(retrieval !== undefined, '缺少 retrieval 配置');
  assert(typeof retrieval.enabled === 'boolean', 'retrieval.enabled 必须是布尔值');
  assertPositiveInt(retrieval.topK, 'retrieval.topK');

  const tools = raw.tools as Record<string, boolean> | undefined;
  assertBooleanMap(tools, 'tools');

  const features = raw.features as Record<string, boolean> | undefined;
  assertBooleanMap(features, 'features');

  return { llm: llm as LlmRunConfig, retrieval: retrieval as RetrievalConfig, tools, features };
}
