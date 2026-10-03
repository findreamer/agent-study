import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadLangchainConfig } from './load-langchain-config.js';

const VALID = `
llm:
  provider: openai
  model: gpt-5.4
  temperature: 0
  maxTokens: 800
  timeoutMs: 30000
retrieval:
  enabled: true
  topK: 3
tools:
  enableConstraintCheck: true
  enableEntityLookup: true
features:
  enableStructuredOutput: true
  enableStreaming: true
`;

function loadFrom(content: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lc-config-'));
  const file = path.join(dir, 'langchain.yaml');
  writeFileSync(file, content);
  const original = process.env.LANGCHAIN_CONFIG_PATH;
  process.env.LANGCHAIN_CONFIG_PATH = file;
  try {
    return loadLangchainConfig();
  } finally {
    if (original === undefined) delete process.env.LANGCHAIN_CONFIG_PATH;
    else process.env.LANGCHAIN_CONFIG_PATH = original;
  }
}

describe('loadLangchainConfig', () => {
  it('解析合法配置', () => {
    expect(loadFrom(VALID)).toEqual({
      llm: {
        provider: 'openai',
        model: 'gpt-5.4',
        temperature: 0,
        maxTokens: 800,
        timeoutMs: 30000,
      },
      retrieval: { enabled: true, topK: 3 },
      tools: { enableConstraintCheck: true, enableEntityLookup: true },
      features: { enableStructuredOutput: true, enableStreaming: true },
    });
  });

  it('llm.model 缺失时报错', () => {
    expect(() => loadFrom('llm:\n  provider: openai\n')).toThrow(/llm\.model/);
  });

  it('temperature 超出范围时报错', () => {
    expect(() =>
      loadFrom(VALID.replace('temperature: 0', 'temperature: 9')),
    ).toThrow(/temperature/);
  });

  it('retrieval.topK 必须是正整数', () => {
    expect(() => loadFrom(VALID.replace('topK: 3', 'topK: 0'))).toThrow(
      /retrieval\.topK/,
    );
  });

  it('features 值必须为布尔', () => {
    expect(() =>
      loadFrom(VALID.replace('enableStreaming: true', 'enableStreaming: not-bool')),
    ).toThrow(/features\.enableStreaming/);
  });
});
