import { mkdtempSync, promises as fsp, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Embeddings } from '@langchain/core/embeddings';
import type { PrismaService } from '../prisma/prisma.service.js';
import { DocumentProcessService } from './document-process.service.js';

let uploadDir: string;

function makePrisma() {
  return {
    document: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    documentChunk: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    taskEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
  } as unknown as PrismaService;
}

function docRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    userId: 'u1',
    filename: 'a.md',
    mimeType: 'text/markdown',
    size: 1,
    filePath: null,
    storageType: 'local',
    status: 'pending',
    chunkCount: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

// 固定向量便于断言：内容不同返回不同维度，保证向量化真实走了一遍
class FakeEmbeddings extends Embeddings {
  constructor() {
    super({});
  }
  async embedQuery(): Promise<number[]> {
    return [1, 0, 0];
  }
  async embedDocuments(docs: string[]): Promise<number[][]> {
    return docs.map((_, i) => [i, 1, 0]);
  }
}

beforeAll(() => {
  uploadDir = mkdtempSync(path.join(tmpdir(), 'uploads-'));
});

afterAll(async () => {
  rmSync(uploadDir, { recursive: true, force: true });
});

describe('DocumentProcessService', () => {
  it('完整管道：解析→分块→向量化→逐块 $executeRaw，status pending→processing→done', async () => {
    const prisma = makePrisma();
    const text = Array.from({ length: 60 }, (_, i) => `第${i}行：需求分析系统测试内容。`).join('\n');
    const filePath = path.join(uploadDir, 'a.md');
    await fsp.writeFile(filePath, text);
    vi.mocked(prisma.document.findUnique!).mockResolvedValue(
      docRow({ filePath: path.relative(process.cwd(), filePath) }),
    );
    const service = new DocumentProcessService(
      prisma,
      new FakeEmbeddings() as unknown as Embeddings,
    );

    await service.process('d1', 'u1');

    // 分块插入：每块一条 $executeRaw（::vector 转换）
    const rawCalls = vi.mocked(prisma.$executeRaw!).mock.calls;
    expect(rawCalls.length).toBeGreaterThanOrEqual(2);
    const rawSql = String(rawCalls[0]![0]);
    expect(rawSql).toContain('document_chunks');
    expect(rawSql).toContain('::vector');

    // 状态推进 + chunkCount
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { status: 'processing' },
    });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { status: 'done', chunkCount: rawCalls.length },
    });

    // 事件：processing → done
    expect(prisma.taskEvent.create).toHaveBeenCalledTimes(2);
    expect(vi.mocked(prisma.taskEvent.create!).mock.calls[0]![0]!.data).toMatchObject({
      userId: 'u1', taskType: 'document_process', taskId: 'd1', status: 'processing',
    });
    expect(vi.mocked(prisma.taskEvent.create!).mock.calls[1]![0]!.data).toMatchObject({
      status: 'done',
    });
  });

  it('归属校验：他人文档直接 NotFound，不动状态', async () => {
    const prisma = makePrisma();
    vi.mocked(prisma.document.findUnique!).mockResolvedValue(docRow({ userId: 'other' }));
    const service = new DocumentProcessService(
      prisma,
      new FakeEmbeddings() as unknown as Embeddings,
    );

    await expect(service.process('d1', 'u1')).rejects.toThrow('文档不存在');
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it('解析失败：status 置 error 并写 error 事件', async () => {
    const prisma = makePrisma();
    vi.mocked(prisma.document.findUnique!).mockResolvedValue(docRow()); // filePath null
    const service = new DocumentProcessService(
      prisma,
      new FakeEmbeddings() as unknown as Embeddings,
    );

    await expect(service.process('d1', 'u1')).rejects.toThrow('文档缺少本地文件');
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { status: 'error' },
    });
    expect(vi.mocked(prisma.taskEvent.create!).mock.calls.at(-1)![0]!.data).toMatchObject({
      status: 'error',
    });
  });
});
