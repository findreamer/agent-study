import { Injectable } from '@nestjs/common';
import {
  XenovaEmbeddings,
  EMBEDDING_DIMENSION,
} from '../llm/embedding/embedding.service.js';

/**
 * document 域的向量化入口。
 * 模型与池化逻辑复用第四章的 XenovaEmbeddings（mean pooling + normalize: true，
 * normalize 即 L2 单位化，输出固定 384 维），委托注入的单例避免二次加载模型。
 */
@Injectable()
export class DocumentEmbeddingService {
  // 供调用方/测试断言的维度常量透传
  static readonly DIMENSION = EMBEDDING_DIMENSION;

  constructor(private readonly xenova: XenovaEmbeddings) {}

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    return this.xenova.embedDocuments(texts);
  }
}
