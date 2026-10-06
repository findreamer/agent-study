import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard.js';
import { UiFlowService } from './ui-flow.service.js';
import { UiResponseService } from './ui-response.service.js';
import type { AIUIResponse, UIAction } from './ui-types.js';

const COMPONENT_TYPES = new Set([
  'text',
  'selection',
  'form',
  'confirmation',
  'card',
  'steps',
  'table',
  'action_buttons',
]);

const ACTION_PAYLOAD_TYPES = new Set([
  'select',
  'submit',
  'confirm',
  'click',
  'row_select',
]);

@UseGuards(JwtAuthGuard)
@Controller('api/ui-chat')
export class UiChatController {
  constructor(
    private readonly uiResponse: UiResponseService,
    private readonly flow: UiFlowService,
  ) {}

  /** 自由输入：LLM Structured Output 生成带 UI 组件的结构化回复 */
  @Post('chat')
  async chat(
    @Body() body: { sessionId?: string; input?: string },
  ): Promise<AIUIResponse> {
    const sessionId = body?.sessionId;
    const input = body?.input;
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new BadRequestException('sessionId 必须是非空字符串');
    }
    if (typeof input !== 'string' || !input.trim()) {
      throw new BadRequestException('input 必须是非空字符串');
    }
    const { history, ...context } = this.flow.recordUserInput(sessionId, input);
    const response = await this.uiResponse.generateUIResponse(
      input,
      history,
      context,
    );
    this.flow.recordAssistantResponse(sessionId, response);
    return response;
  }

  /** UI 操作回传：确定性状态机推进流程，不经过模型 */
  @Post('action')
  handleAction(@Body() body: { sessionId?: string; action?: UIAction }) {
    const sessionId = body?.sessionId;
    const action = body?.action;
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new BadRequestException('sessionId 必须是非空字符串');
    }
    if (!action || typeof action !== 'object') {
      throw new BadRequestException('action 必须是对象');
    }
    if (
      typeof action.componentType !== 'string' ||
      !COMPONENT_TYPES.has(action.componentType)
    ) {
      throw new BadRequestException(`未知的组件类型：${String(action.componentType)}`);
    }
    const payload = action.payload as Record<string, unknown> | undefined;
    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.type !== 'string' ||
      !ACTION_PAYLOAD_TYPES.has(payload.type)
    ) {
      throw new BadRequestException('action.payload.type 非法');
    }
    return this.flow.handleAction(sessionId, action);
  }
}
