import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { DocumentEmbeddingService } from './embedding.service.js';

export interface SemanticSearchResult {
  content: string;
  /** 相似度 = 1 - 余弦距离，1 全同、0 正交；按相似度倒序返回 */
  score: number;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: DocumentEmbeddingService,
  ) {}

  /**
   * 语义检索：query 向量化 → pgvector `<=>` 余弦距离排序。
   * JOIN documents 按 userId 过滤实现用户隔离（自己的分块才可检索）。
   * Prisma 对 vector 列只读，检索必须走 $queryRaw。
   */
  async similaritySearch(
    query: string,
    userId: string,
    topK: number,
  ): Promise<SemanticSearchResult[]> {
    const [vector] = await this.embeddings.embedTexts([query]);
    if (!vector) return [];
    const literal = `[${vector.join(',')}]`;

    return this.prisma.$queryRaw<SemanticSearchResult[]>`
      SELECT c.content,
             1 - (c.embedding <=> ${literal}::vector) AS score
      FROM document_chunks c
      JOIN documents d ON d.id = c."documentId"
      WHERE d."userId" = ${userId}
      ORDER BY c.embedding <=> ${literal}::vector
      LIMIT ${topK}
    `;
  }
}
