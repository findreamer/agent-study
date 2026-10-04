import { Inject, Injectable } from '@nestjs/common';
import { Document } from '@langchain/core/documents';
import { Embeddings } from '@langchain/core/embeddings';
import { MemoryVectorStore } from '@langchain/classic/vectorstores/memory';
import { XenovaEmbeddings } from './embedding.service.js';

export interface VectorSearchResult {
  content: string;
  score: number;
}

@Injectable()
export class VectorStoreService {
  private store: MemoryVectorStore | null = null;

  // token 指向具体 provider，参数类型保持抽象以便测试注入 FakeEmbeddings
  constructor(
    @Inject(XenovaEmbeddings) private readonly embeddings: Embeddings,
  ) {}

  private ensureStore(): MemoryVectorStore {
    this.store ??= new MemoryVectorStore(this.embeddings);
    return this.store;
  }

  async addTexts(texts: string[]): Promise<number> {
    const store = this.ensureStore();
    await store.addDocuments(
      texts.map((text) => new Document({ pageContent: text })),
    );
    return texts.length;
  }

  async search(query: string, k: number): Promise<VectorSearchResult[]> {
    const store = this.ensureStore();
    const results = await store.similaritySearchWithScore(query, k);
    return results.map(([doc, score]) => ({ content: doc.pageContent, score }));
  }
}
