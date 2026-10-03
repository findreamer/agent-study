export interface ApiKeys {
  openAiApiKey: string | undefined;
  openAiBaseUrl: string | undefined;
  embeddingApiKey: string | undefined;
  vectorDbUrl: string | undefined;
  vectorDbApiKey: string | undefined;
}

function readKey(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function getApiKeys(): ApiKeys {
  return {
    openAiApiKey: readKey('OPENAI_API_KEY'),
    openAiBaseUrl: readKey('OPENAI_BASE_URL'),
    embeddingApiKey: readKey('EMBEDDING_API_KEY'),
    vectorDbUrl: readKey('VECTOR_DB_URL'),
    vectorDbApiKey: readKey('VECTOR_DB_API_KEY'),
  };
}
