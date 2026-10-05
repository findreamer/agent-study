import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SearchService } from './search.service.js';
import type { DocumentEmbeddingService } from './embedding.service.js';

function makePrisma() {
  return {
    $queryRaw: vi.fn().mockResolvedValue([
      { content: '会话历史必须持久化', score: 0.87 },
      { content: '支持文档语义检索', score: 0.72 },
    ]),
  } as unknown as PrismaService;
}

function fakeEmbeddings(dim: number): DocumentEmbeddingService {
  return {
    embedTexts: vi.fn().mockResolvedValue([Array.from({ length: dim }, () => 0.1)]),
  } as unknown as DocumentEmbeddingService;
}

describe('SearchService.similaritySearch', () => {
  it('query 向量化后走 $queryRaw，SQL 含 <=> 余弦距离与 userId 隔离', async () => {
    const prisma = makePrisma();
    const service = new SearchService(prisma, fakeEmbeddings(384));

    const results = await service.similaritySearch('会话记忆持久化', 'u1', 5);

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = String(vi.mocked(prisma.$queryRaw!).mock.calls[0]![0]);
    expect(sql).toContain('<=>');
    expect(sql).toContain('document_chunks');
    expect(sql).toContain('documents');
    expect(sql).toContain('"userId"');
    expect(sql).toContain('LIMIT');
    // 返回 topK 结果，score = 1 - 距离
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ content: '会话历史必须持久化', score: 0.87 });
  });

  it('向量以 [..] 字面量参数化传入并 ::vector 转换', async () => {
    const prisma = makePrisma();
    const service = new SearchService(prisma, fakeEmbeddings(3));

    await service.similaritySearch('q', 'u1', 5);

    const call = vi.mocked(prisma.$queryRaw!).mock.calls[0] as unknown[];
    const values = call.slice(1) as unknown[];
    expect(values.some((v) => v === '[0.1,0.1,0.1]')).toBe(true);
  });

  it('query 向量化失败（无向量）时返回空数组而不查库', async () => {
    const prisma = makePrisma();
    const empty = {
      embedTexts: vi.fn().mockResolvedValue([]),
    } as unknown as DocumentEmbeddingService;
    const service = new SearchService(prisma, empty);

    await expect(service.similaritySearch('q', 'u1', 5)).resolves.toEqual([]);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
