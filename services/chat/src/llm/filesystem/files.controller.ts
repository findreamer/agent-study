import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { FilesystemService } from './filesystem.service.js';

@Controller('api/files')
export class FilesController {
  constructor(private readonly files: FilesystemService) {}

  @Post('chat')
  chat(@Body() body: { input?: string }) {
    const input = body?.input;
    if (typeof input !== 'string' || !input.trim()) {
      throw new BadRequestException('input 必须是非空字符串');
    }
    return this.files.chat(input);
  }
}
