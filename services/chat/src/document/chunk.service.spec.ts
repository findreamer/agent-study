import { mkdtempSync, promises as fsp, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { SseService } from '../sse/sse.service.js';
import { ChunkService } from './chunk.service.js';
import type { DocumentEmbeddingService } from './embedding.service.js';

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
    $executeRaw: vi.fn().mockResolvedValue(1),
  } as unknown as PrismaService;
}

function fakeSse() {
  return {
    emit: vi.fn().mockResolvedValue({}),
  } as unknown as SseService;
}

// 每块返回可区分的固定向量，保证 embedTexts 真实参与管道
function fakeEmbeddings(): DocumentEmbeddingService {
  return {
    embedTexts: vi
      .fn()
      .mockImplementation(async (texts: string[]) => texts.map((_, i) => [i, 1, 0])),
  } as unknown as DocumentEmbeddingService;
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

beforeAll(() => {
  uploadDir = mkdtempSync(path.join(tmpdir(), 'uploads-'));
  process.env.UPLOAD_DIR = uploadDir;
});

afterAll(() => {
  delete process.env.UPLOAD_DIR;
  rmSync(uploadDir, { recursive: true, force: true });
});

describe('ChunkService.processDocument', () => {
  it('完整管道：解析→分块→embedTexts→逐块 $executeRaw，status pending→processing→done', async () => {
    const prisma = makePrisma();
    const sse = fakeSse();
    const text = Array.from({ length: 60 }, (_, i) => `第${i}行：需求分析系统测试内容。`).join('\n');
    const filePath = path.join(uploadDir, 'a.md');
    await fsp.writeFile(filePath, text);
    vi.mocked(prisma.document.findUnique!).mockResolvedValue(
      docRow({ filePath: 'a.md' }),
    );
    const service = new ChunkService(prisma, fakeEmbeddings(), sse);

    await service.processDocument('d1', 'u1');

    const rawCalls = vi.mocked(prisma.$executeRaw!).mock.calls;
    expect(rawCalls.length).toBeGreaterThanOrEqual(2);
    const rawSql = String(rawCalls[0]![0]);
    expect(rawSql).toContain('document_chunks');
    expect(rawSql).toContain('::vector');

    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { status: 'processing' },
    });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { status: 'done', chunkCount: rawCalls.length },
    });

    // 事件经 SseService.emit：processing → done（落库与推送由 SseService 负责）
    expect(sse.emit).toHaveBeenCalledTimes(2);
    expect(vi.mocked(sse.emit).mock.calls[0]![1]).toMatchObject({
      taskType: 'document_process', taskId: 'd1', status: 'processing',
    });
    expect(vi.mocked(sse.emit).mock.calls[1]![1]).toMatchObject({
      status: 'done',
      metadata: { chunkCount: rawCalls.length },
    });
  });

  it('归属校验：他人文档直接 NotFound，不动状态', async () => {
    const prisma = makePrisma();
    vi.mocked(prisma.document.findUnique!).mockResolvedValue(docRow({ userId: 'other' }));
    const service = new ChunkService(prisma, fakeEmbeddings(), fakeSse());

    await expect(service.processDocument('d1', 'u1')).rejects.toThrow('文档不存在');
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it('解析失败：status 置 error 并发出 error 事件', async () => {
    const prisma = makePrisma();
    const sse = fakeSse();
    vi.mocked(prisma.document.findUnique!).mockResolvedValue(docRow()); // filePath null
    const service = new ChunkService(prisma, fakeEmbeddings(), sse);

    await expect(service.processDocument('d1', 'u1')).rejects.toThrow('文档缺少本地文件');
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { status: 'error' },
    });
    const lastCall = vi.mocked(sse.emit).mock.calls.at(-1)!;
    expect(lastCall[0]).toBe('u1');
    expect(lastCall[1]).toMatchObject({ taskType: 'document_process', status: 'error' });
  });
});
