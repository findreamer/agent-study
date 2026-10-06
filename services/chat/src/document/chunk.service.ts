import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { PrismaService } from '../prisma/prisma.service.js';
import { SseService } from '../sse/sse.service.js';
import { DocumentEmbeddingService } from './embedding.service.js';
import { uploadsRoot } from './document.service.js';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const EMBED_BATCH_SIZE = 16;

@Injectable()
export class ChunkService {
  private readonly logger = new Logger(ChunkService.name);
  private readonly splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: DocumentEmbeddingService,
    private readonly sse: SseService,
  ) {}

  /**
   * 完整管道：解析 → 分块 → embedTexts 向量化 → raw SQL 写 document_chunks.embedding。
   * 由 Controller 以 202 触发、fire-and-forget 调用；
   * 无论成败都经 SseService 记录进度事件（先落 task_events 再实时推送），
   * 并把 documents.status 推到 done/error。
   */
  async processDocument(documentId: string, userId: string): Promise<void> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.userId !== userId) {
      throw new NotFoundException('文档不存在');
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'processing' },
    });
    await this.sse.emit(userId, {
      taskType: 'document_process',
      taskId: documentId,
      status: 'processing',
      message: '开始解析与向量化',
    });

    try {
      const text = await this.parseToText(doc.filePath, doc.mimeType);
      if (!text.trim()) {
        throw new Error('解析结果为空，无法向量化');
      }
      const chunks = await this.splitter.splitText(text);

      // 支持重复处理：先清掉旧分块再写入
      await this.prisma.documentChunk.deleteMany({ where: { documentId } });

      for (let start = 0; start < chunks.length; start += EMBED_BATCH_SIZE) {
        const batch = chunks.slice(start, start + EMBED_BATCH_SIZE);
        const vectors = await this.embeddings.embedTexts(batch);
        for (let i = 0; i < batch.length; i++) {
          await this.insertChunk(documentId, start + i, batch[i]!, vectors[i]);
        }
      }

      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'done', chunkCount: chunks.length },
      });
      await this.sse.emit(userId, {
        taskType: 'document_process',
        taskId: documentId,
        status: 'done',
        message: `向量化完成，共 ${chunks.length} 块`,
        metadata: { chunkCount: chunks.length },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`文档 ${documentId} 处理失败：${message}`);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'error' },
      });
      await this.sse.emit(userId, {
        taskType: 'document_process',
        taskId: documentId,
        status: 'error',
        message: `处理失败：${message}`,
      });
      throw error;
    }
  }

  private async parseToText(
    filePath: string | null,
    mimeType: string,
  ): Promise<string> {
    if (!filePath) throw new Error('文档缺少本地文件');
    // filePath 存的是相对 uploadsRoot() 的路径（见 document.service.upload）
    const buffer = await readFile(path.resolve(uploadsRoot(), filePath));

    if (mimeType.startsWith('text/')) return buffer.toString('utf8');
    if (mimeType === 'application/pdf') {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }
    if (
      mimeType === 'application/msword' ||
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      // mammoth 仅支持 .docx；旧版二进制 .doc 会在此抛错 → 走 error 事件
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    throw new Error(`不支持的解析类型：${mimeType}`);
  }

  /**
   * Prisma client 对 Unsupported("vector") 列只读，写入必须走 $executeRaw；
   * 向量以 '[1,2,3]' 字符串参数传入并 ::vector 转换，参数化拼接避免注入。
   */
  private async insertChunk(
    documentId: string,
    chunkIndex: number,
    content: string,
    vector: number[] | undefined,
  ): Promise<void> {
    const literal = vector ? `[${vector.join(',')}]` : null;
    await this.prisma.$executeRaw`
      INSERT INTO document_chunks (id, "documentId", content, "chunkIndex", embedding, "createdAt")
      VALUES (${randomUUID()}, ${documentId}, ${content}, ${chunkIndex}, ${literal}::vector, now())
    `;
  }
}
