import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import type { Embeddings } from '@langchain/core/embeddings';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { XenovaEmbeddings } from '../llm/embedding/embedding.service.js';
import { uploadsRoot } from './document.service.js';

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const EMBED_BATCH_SIZE = 16;

@Injectable()
export class DocumentProcessService {
  private readonly logger = new Logger(DocumentProcessService.name);
  private readonly splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  constructor(
    private readonly prisma: PrismaService,
    // token 指向具体 provider，参数类型保持抽象以便测试注入 FakeEmbeddings
    @Inject(XenovaEmbeddings) private readonly embeddings: Embeddings,
  ) {}

  /**
   * 解析 → 分块 → 向量化 → 落库 完整管道。
   * 由 Controller 以 202 触发、fire-and-forget 调用；
   * 无论成败都把进度写入 task_events，并把 documents.status 推到 done/error。
   */
  async process(documentId: string, userId: string): Promise<void> {
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
    await this.emitEvent(userId, documentId, 'processing', '开始解析与向量化');

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
        const vectors = await this.embeddings.embedDocuments(batch);
        for (let i = 0; i < batch.length; i++) {
          await this.insertChunk(documentId, start + i, batch[i]!, vectors[i]);
        }
      }

      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'done', chunkCount: chunks.length },
      });
      await this.emitEvent(userId, documentId, 'done', `向量化完成，共 ${chunks.length} 块`, {
        chunkCount: chunks.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`文档 ${documentId} 处理失败：${message}`);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'error' },
      });
      await this.emitEvent(userId, documentId, 'error', `处理失败：${message}`);
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

  private emitEvent(
    userId: string,
    taskId: string,
    status: 'processing' | 'done' | 'error',
    message: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    return this.prisma.taskEvent.create({
      data: { userId, taskType: 'document_process', taskId, status, message, metadata },
    });
  }
}
