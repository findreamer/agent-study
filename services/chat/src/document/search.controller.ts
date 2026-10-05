import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/jwt-auth.guard.js';
import { SearchService } from './search.service.js';

const MAX_TOP_K = 20;
const DEFAULT_TOP_K = 5;

@UseGuards(JwtAuthGuard)
@Controller('api/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async search(
    @CurrentUser() user: AuthUser,
    @Body() body: { query?: string; topK?: number },
  ) {
    const query = body?.query;
    if (typeof query !== 'string' || !query.trim()) {
      throw new BadRequestException('query 必须是非空字符串');
    }
    let topK = body?.topK ?? DEFAULT_TOP_K;
    if (!Number.isInteger(topK) || topK < 1 || topK > MAX_TOP_K) {
      throw new BadRequestException(`topK 必须是 1~${MAX_TOP_K} 的整数`);
    }
    const results = await this.searchService.similaritySearch(query, user.userId, topK);
    return { query, topK, results };
  }
}
