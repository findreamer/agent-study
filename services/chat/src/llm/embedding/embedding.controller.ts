import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { XenovaEmbeddings } from './embedding.service.js';
import { VectorStoreService } from './vector-store.service.js';

const MAX_STORE_BATCH = 50;
const MAX_SEARCH_K = 20;

@Controller('api/embedding')
export class EmbeddingController {
  constructor(
    private readonly embeddings: XenovaEmbeddings,
    private readonly vectorStore: VectorStoreService,
  ) {}

  @Post('embed')
  async embed(@Body() body: { text?: string }) {
    const text = body?.text;
    if (typeof text !== 'string' || !text.trim()) {
      throw new BadRequestException('text 必须是非空字符串');
    }
    const vector = await this.embeddings.embedQuery(text);
    return { dimension: vector.length, vector };
  }

  @Post('store')
  async store(@Body() body: { texts?: string[] }) {
    const texts = body?.texts;
    if (
      !Array.isArray(texts) ||
      texts.length === 0 ||
      texts.length > MAX_STORE_BATCH ||
      texts.some((text) => typeof text !== 'string' || !text.trim())
    ) {
      throw new BadRequestException(
        `texts 必须是 1~${MAX_STORE_BATCH} 条非空字符串数组`,
      );
    }
    return { stored: await this.vectorStore.addTexts(texts) };
  }

  @Post('search')
  async search(@Body() body: { query?: string; k?: number }) {
    const query = body?.query;
    if (typeof query !== 'string' || !query.trim()) {
      throw new BadRequestException('query 必须是非空字符串');
    }
    const k = body?.k ?? 3;
    if (!Number.isInteger(k) || k < 1 || k > MAX_SEARCH_K) {
      throw new BadRequestException(`k 必须是 1~${MAX_SEARCH_K} 的整数`);
    }
    return { documents: await this.vectorStore.search(query, k) };
  }
}
