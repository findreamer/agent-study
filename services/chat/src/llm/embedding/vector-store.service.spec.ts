import { Embeddings } from '@langchain/core/embeddings';
import { beforeEach, describe, expect, it } from 'vitest';
import { VectorStoreService } from './vector-store.service.js';

// 离线假嵌入：确定性向量，相同文本向量相同，共享字符越多越相似
function vectorFor(text: string): number[] {
  const vec = new Array(8).fill(0);
  for (const ch of text) vec[ch.charCodeAt(0) % 8] += 1;
  return vec;
}

class FakeEmbeddings extends Embeddings {
  constructor() {
    super({});
  }

  async embedQuery(text: string): Promise<number[]> {
    return vectorFor(text);
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    return documents.map(vectorFor);
  }
}

describe('VectorStoreService', () => {
  let service: VectorStoreService;

  beforeEach(() => {
    service = new VectorStoreService(new FakeEmbeddings());
  });

  it('addTexts 返回入库条数', async () => {
    expect(await service.addTexts(['文档一', '文档二'])).toBe(2);
  });

  it('search 命中与查询最相似的文档并按相似度排序', async () => {
    await service.addTexts(['苹果手机发布新机型', '香蕉是黄色水果']);
    const results = await service.search('香蕉是黄色水果', 2);
    expect(results).toHaveLength(2);
    expect(results[0]?.content).toBe('香蕉是黄色水果');
    expect(results[0]?.score).toBeGreaterThanOrEqual(results[1]!.score);
  });

  it('search 支持截断 topK', async () => {
    await service.addTexts(['甲文档', '乙文档', '丙文档']);
    const results = await service.search('甲文档', 1);
    expect(results).toHaveLength(1);
    expect(results[0]?.content).toBe('甲文档');
  });

  it('空库 search 返回空数组', async () => {
    expect(await service.search('任意查询', 3)).toEqual([]);
  });

  it('k 超过库存时返回全部文档', async () => {
    await service.addTexts(['只有一条']);
    expect(await service.search('只有一条', 5)).toHaveLength(1);
  });
});
