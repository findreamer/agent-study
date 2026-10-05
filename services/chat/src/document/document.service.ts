import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** 允许上传的 MIME 类型（docx 实际 MIME 为 openxml 系列，msword 为旧版 .doc） */
export const ALLOWED_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/** 部分客户端对 txt/md/pdf 会发 application/octet-stream，此时按扩展名兜底 */
export const ALLOWED_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.pdf',
  '.doc',
  '.docx',
]);

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export function isAllowedFile(filename: string, mimetype: string): boolean {
  if (ALLOWED_MIME_TYPES.has(mimetype)) return true;
  if (mimetype === 'application/octet-stream') {
    return ALLOWED_EXTENSIONS.has(path.extname(filename).toLowerCase());
  }
  return false;
}

/** 上传根目录：默认 services/chat/uploads，可用 UPLOAD_DIR 覆盖（测试隔离） */
export function uploadsRoot(): string {
  return process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.resolve(process.cwd(), 'uploads');
}

@Injectable()
export class DocumentService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(userId: string, file: Express.Multer.File, filename: string) {
    // 防路径穿越：只取文件名部分，并限制长度
    const safeName = path.basename(filename).slice(0, 200) || 'unnamed';
    const dir = path.join(uploadsRoot(), userId);
    await fs.mkdir(dir, { recursive: true });
    const storedName = `${Date.now()}-${safeName}`;
    const absolutePath = path.join(dir, storedName);
    await fs.writeFile(absolutePath, file.buffer);

    return this.prisma.document.create({
      data: {
        userId,
        filename: safeName,
        mimeType: file.mimetype,
        size: file.size,
        // 存相对 uploadsRoot() 的路径，读取/删除时再解析（对 cwd 与容器部署稳定）
        filePath: path.join(userId, storedName),
        status: 'pending',
      },
    });
  }

  findByUser(userId: string) {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 归属校验：不存在或非本人一律 NotFound，不泄露文档存在性 */
  async findById(documentId: string, userId: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc || doc.userId !== userId) {
      throw new NotFoundException('文档不存在');
    }
    return doc;
  }

  async delete(documentId: string, userId: string) {
    const doc = await this.findById(documentId, userId);
    if (doc.filePath) {
      await fs.rm(path.resolve(uploadsRoot(), doc.filePath), { force: true });
    }
    await this.prisma.document.delete({ where: { id: documentId } });
    return { ok: true };
  }
}
