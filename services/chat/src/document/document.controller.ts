import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/jwt-auth.guard.js';
import { DocumentService, isAllowedFile, MAX_FILE_SIZE } from './document.service.js';
import { DocumentProcessService } from './document-process.service.js';

@UseGuards(JwtAuthGuard)
@Controller('api/documents')
export class DocumentController {
  private readonly logger = new Logger(DocumentController.name);

  constructor(
    private readonly documents: DocumentService,
    private readonly processService: DocumentProcessService,
  ) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      // 内存存储：上传后由服务层自行落盘到 uploads/{userId}/，便于统一管理路径
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, callback) => {
        if (isAllowedFile(file.originalname, file.mimetype)) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              '仅支持 txt / md / pdf / docx 文件（10MB 以内）',
            ),
            false,
          );
        }
      },
    }),
  )
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('file 字段必填（multipart/form-data）');
    }
    const document = await this.documents.upload(user.userId, file, file.originalname);
    return { document };
  }

  /** 异步触发解析+分块+向量化：立即返回 202，进度通过 task_events 查询/推送 */
  @Post(':id/process')
  @HttpCode(HttpStatus.ACCEPTED)
  async process(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const document = await this.documents.findById(id, user.userId);
    // fire-and-forget：成败都记录在 documents.status 与 task_events
    void this.processService.process(id, user.userId).catch((error: unknown) => {
      this.logger.error(
        `文档 ${id} 异步处理失败：${error instanceof Error ? error.message : String(error)}`,
      );
    });
    return { documentId: id, status: 'processing', filename: document.filename };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { documents: await this.documents.findByUser(user.userId) };
  }

  @Get(':id')
  async detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return { document: await this.documents.findById(id, user.userId) };
  }

  @Delete(':id')
  async delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documents.delete(id, user.userId);
  }
}
