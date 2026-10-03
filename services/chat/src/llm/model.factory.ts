import { ChatOpenAI } from '@langchain/openai';
import { getApiKeys } from '../config/api-keys.js';
import { loadLangchainConfig } from '../config/load-langchain-config.js';

export function createChatModel(): ChatOpenAI {
  const { openAiApiKey, openAiBaseUrl } = getApiKeys();
  if (!openAiApiKey) {
    throw new Error('OPENAI_API_KEY 未配置：请在 services/chat/.env 中填写');
  }
  const { llm } = loadLangchainConfig();
  if (llm.provider !== 'openai') {
    throw new Error(`暂不支持的 llm.provider：${llm.provider}（当前仅支持 openai）`);
  }
  return new ChatOpenAI({
    model: llm.model,
    temperature: llm.temperature,
    maxTokens: llm.maxTokens,
    timeout: llm.timeoutMs,
    apiKey: openAiApiKey,
    configuration: openAiBaseUrl ? { baseURL: openAiBaseUrl } : undefined,
  });
}
