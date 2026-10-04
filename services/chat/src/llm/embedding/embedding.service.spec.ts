import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMBEDDING_DIMENSION,
  XenovaEmbeddings,
} from './embedding.service.js';

describe('XenovaEmbeddings（本地模型）', () => {
  let service: XenovaEmbeddings;

  beforeEach(() => {
    service = new XenovaEmbeddings();
  });

  it(
    'embedQuery 返回固定维度向量',
    { timeout: 300000 },
    async () => {
      const vector = await service.embedQuery('需求分析助手需要记住多轮对话');
      expect(vector).toHaveLength(EMBEDDING_DIMENSION);
      expect(vector.every((value) => typeof value === 'number')).toBe(true);
      // normalize: true 保证模长为 1
      const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1, 5);
    },
  );

  it(
    'embedDocuments 批量返回等量向量',
    { timeout: 300000 },
    async () => {
      const vectors = await service.embedDocuments(['需求规范', '验收标准']);
      expect(vectors).toHaveLength(2);
      expect(vectors[0]).toHaveLength(EMBEDDING_DIMENSION);
      expect(vectors[1]).toHaveLength(EMBEDDING_DIMENSION);
    },
  );

  it(
    '语义相近文本的相似度高于无关文本',
    { timeout: 300000 },
    async () => {
      const [query, requirement, weather] = await service.embedDocuments([
        '怎样判断一个需求是否完整',
        '需求规范：核心功能、目标用户、业务目标三者齐全才算需求完整',
        '今天天气晴朗适合户外运动',
      ]);
      const dot = (a: number[], b: number[]) =>
        a.reduce((sum, v, i) => sum + v * b[i]!, 0);
      expect(dot(query, requirement)).toBeGreaterThan(dot(query, weather));
    },
  );

  it('空数组入参直接返回空数组，不触发模型', async () => {
    expect(await service.embedDocuments([])).toEqual([]);
  });
});
