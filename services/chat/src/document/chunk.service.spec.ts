import { mkdtempSync, promises as fsp, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
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
    taskEvent: {
      create: vi.fn().mockResolvedValue({}),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
  } as unknown as PrismaService;
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
    const text = Array.from({ length: 60 }, (_, i) => `第${i}行：需求分析系统测试内容。`).join('\n');
    const filePath = path.join(uploadDir, 'a.md');
    await fsp.writeFile(filePath, text);
    vi.mocked(prisma.document.findUnique!).mockResolvedValue(
      docRow({ filePath: 'a.md' }),
    );
    const service = new ChunkService(prisma, fakeEmbeddings());

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
    const service = new ChunkService(prisma, fakeEmbeddings());

    await expect(service.processDocument('d1', 'u1')).rejects.toThrow('文档不存在');
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  it('解析失败：status 置 error 并写 error 事件', async () => {
    const prisma = makePrisma();
    vi.mocked(prisma.document.findUnique!).mockResolvedValue(docRow()); // filePath null
    const service = new ChunkService(prisma, fakeEmbeddings());

    await expect(service.processDocument('d1', 'u1')).rejects.toThrow('文档缺少本地文件');
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { status: 'error' },
    });
    expect(vi.mocked(prisma.taskEvent.create!).mock.calls.at(-1)![0]!.data).toMatchObject({
      status: 'error',
    });
  });
});
