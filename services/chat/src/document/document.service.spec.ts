import { mkdtempSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  DocumentService,
  isAllowedFile,
  MAX_FILE_SIZE,
} from './document.service.js';

let uploadDir: string;

function makePrisma() {
  return {
    document: {
      create: vi.fn().mockImplementation(({ data }) => ({
        id: 'd1',
        chunkCount: 0,
        storageType: 'local',
        createdAt: new Date(),
        ...data,
      })),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
    },
  } as unknown as PrismaService;
}

function makeFile(name: string, mimetype: string) {
  return {
    originalname: name,
    mimetype,
    size: 5,
    buffer: Buffer.from('hello'),
  } as Express.Multer.File;
}

beforeAll(() => {
  uploadDir = mkdtempSync(path.join(tmpdir(), 'uploads-'));
  process.env.UPLOAD_DIR = uploadDir;
});

afterAll(async () => {
  delete process.env.UPLOAD_DIR;
  await fs.rm(uploadDir!, { recursive: true, force: true });
});

describe('isAllowedFile', () => {
  it('放行清单内的 MIME 类型', () => {
    expect(isAllowedFile('a.txt', 'text/plain')).toBe(true);
    expect(isAllowedFile('a.md', 'text/markdown')).toBe(true);
    expect(isAllowedFile('a.pdf', 'application/pdf')).toBe(true);
    expect(isAllowedFile('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    expect(isAllowedFile('a.doc', 'application/msword')).toBe(true);
  });

  it('octet-stream 按扩展名兜底，其余拒绝', () => {
    expect(isAllowedFile('a.md', 'application/octet-stream')).toBe(true);
    expect(isAllowedFile('a.exe', 'application/octet-stream')).toBe(false);
    expect(isAllowedFile('a.sh', 'text/x-sh')).toBe(false);
  });

  it('文件大小限制为 10MB', () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });
});

describe('DocumentService', () => {
  it('upload：文件写入 uploads/{userId}/，元数据落库 status=pending', async () => {
    const prisma = makePrisma();
    const service = new DocumentService(prisma);

    await service.upload('u1', makeFile('需求.txt', 'text/plain'), '需求.txt');

    expect(prisma.document.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        filename: '需求.txt',
        mimeType: 'text/plain',
        status: 'pending',
      }),
    });
    const data = vi.mocked(prisma.document.create!).mock.calls[0][0]!.data;
    expect(data.filePath).toMatch(/^u1[\\/]\d+-需求\.txt$/);
    await expect(fs.access(path.resolve(uploadDir, 'u1', path.basename(data.filePath as string)))).resolves.toBeUndefined();
  });

  it('upload：路径穿越文件名被 basename 拦截', async () => {
    const prisma = makePrisma();
    const service = new DocumentService(prisma);

    await service.upload('u1', makeFile('../../evil.txt', 'text/plain'), '../../evil.txt');

    const data = vi.mocked(prisma.document.create!).mock.calls[0][0]!.data;
    expect(data.filePath).not.toContain('..');
  });

  it('findById：不存在或非本人一律 NotFound', async () => {
    const prisma = makePrisma();
    const service = new DocumentService(prisma);

    vi.mocked(prisma.document.findUnique!).mockResolvedValue(null);
    await expect(service.findById('d1', 'u1')).rejects.toThrow('文档不存在');

    vi.mocked(prisma.document.findUnique!).mockResolvedValue({
      id: 'd1', userId: 'other', filename: 'f', mimeType: 'text/plain',
      size: 1, filePath: 'x', storageType: 'local', status: 'pending',
      chunkCount: 0, createdAt: new Date(),
    });
    await expect(service.findById('d1', 'u1')).rejects.toThrow('文档不存在');
  });

  it('delete：删除物理文件与记录', async () => {
    const prisma = makePrisma();
    const service = new DocumentService(prisma);
    const stored = path.join(uploadDir, 'u1', '1-a.txt');
    await fs.mkdir(path.dirname(stored), { recursive: true });
    await fs.writeFile(stored, 'x');
    vi.mocked(prisma.document.findUnique!).mockResolvedValue({
      id: 'd1', userId: 'u1', filename: 'a.txt', mimeType: 'text/plain',
      size: 1, filePath: 'u1/1-a.txt', storageType: 'local',
      status: 'pending', chunkCount: 0, createdAt: new Date(),
    });

    await expect(service.delete('d1', 'u1')).resolves.toEqual({ ok: true });
    await expect(fs.access(stored)).rejects.toThrow();
    expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
  });
});
