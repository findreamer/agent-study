import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { Embeddings } from '@langchain/core/embeddings';
import { env, pipeline } from '@xenova/transformers';
import type { FeatureExtractionPipeline } from '@xenova/transformers';

export const EMBEDDING_MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const EMBEDDING_DIMENSION = 384;

// 本地运行时配置：模型托管默认走 hf-mirror（本网络环境无法直连 huggingface.co），
// 可用 HF_ENDPOINT 覆盖；模型缓存到 .cache/transformers（已 gitignore），首次调用后离线可用。
env.remoteHost = process.env.HF_ENDPOINT ?? 'https://hf-mirror.com';
env.cacheDir = path.resolve(process.cwd(), '.cache/transformers');

@Injectable()
export class XenovaEmbeddings extends Embeddings {
  private extractor: FeatureExtractionPipeline | null = null;
  private static loading: Promise<FeatureExtractionPipeline> | null = null;

  // 显式无参构造：避免 Nest DI 去解析基类 Embeddings 构造器的参数
  constructor() {
    super({});
  }

  private async ensureExtractor(): Promise<FeatureExtractionPipeline> {
    if (!this.extractor) {
      XenovaEmbeddings.loading ??= pipeline('feature-extraction', EMBEDDING_MODEL_ID);
      try {
        this.extractor = await XenovaEmbeddings.loading;
      } catch (error) {
        XenovaEmbeddings.loading = null; // 加载失败允许下次重试
        throw error;
      }
    }
    return this.extractor;
  }

  async embedQuery(text: string): Promise<number[]> {
    const vector = await this.embedDocuments([text]);
    return vector[0] as number[];
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    if (documents.length === 0) return [];
    const extractor = await this.ensureExtractor();
    const output = await extractor(documents, {
      pooling: 'mean',
      normalize: true,
    });
    return output.tolist() as number[][];
  }
}
