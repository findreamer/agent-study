import { describe, expect, it, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { UiChatController } from './ui-chat.controller.js';
import type { AIUIResponse } from './ui-types.js';

function makeController() {
  const uiResponse = {
    generateUIResponse: vi.fn().mockResolvedValue({
      message: '请选择需求类型',
      components: [{ type: 'selection', title: 't', options: [{ id: 'feature', label: '新功能' }] }],
    } satisfies AIUIResponse),
  };
  const flow = {
    recordUserInput: vi
      .fn()
      .mockReturnValue({ stage: 'intake', collectedData: {}, history: [] }),
    recordAssistantResponse: vi.fn(),
    handleAction: vi.fn().mockReturnValue({ message: 'ok', components: [] }),
    buildDefaultEntry: vi
      .fn()
      .mockReturnValue({ message: '快捷操作', components: [] }),
  };
  return {
    controller: new UiChatController(
      uiResponse as never,
      flow as never,
    ),
    uiResponse,
    flow,
  };
}

describe('UiChatController', () => {
  it('POST chat：记录输入 → 生成结构化回复 → 记录回复', async () => {
    const { controller, uiResponse, flow } = makeController();

    const result = await controller.chat({ sessionId: 's1', input: '我要提一个新需求' });

    expect(result.message).toBe('请选择需求类型');
    expect(flow.recordUserInput).toHaveBeenCalledWith('s1', '我要提一个新需求');
    expect(uiResponse.generateUIResponse).toHaveBeenCalledWith('我要提一个新需求', [], {
      stage: 'intake',
      collectedData: {},
    });
    expect(flow.recordAssistantResponse).toHaveBeenCalledTimes(1);
  });

  it('POST chat：sessionId / input 缺失时抛 400 语义错误', async () => {
    const { controller } = makeController();
    await expect(controller.chat({ input: 'x' })).rejects.toThrow(/sessionId/);
    await expect(controller.chat({ sessionId: 's1' })).rejects.toThrow(/input/);
  });

  it('POST chat：LLM 503 时降级返回快捷操作入口', async () => {
    const { controller, uiResponse, flow } = makeController();
    uiResponse.generateUIResponse.mockRejectedValue(
      new ServiceUnavailableException('LLM 未就绪'),
    );
    (flow.buildDefaultEntry as ReturnType<typeof vi.fn>).mockClear();
    const result = await controller.chat({ sessionId: 's1', input: '随便聊聊' });

    expect(result).toEqual({ message: '快捷操作', components: [] });
    expect(flow.buildDefaultEntry).toHaveBeenCalledWith('s1');
    expect(flow.recordAssistantResponse).not.toHaveBeenCalled();
  });

  it('POST chat：LLM 其他错误照常抛出，不降级', async () => {
    const { controller, uiResponse } = makeController();
    uiResponse.generateUIResponse.mockRejectedValue(new Error('模型输出解析失败'));

    await expect(controller.chat({ sessionId: 's1', input: 'x' })).rejects.toThrow(
      /解析失败/,
    );
  });

  it('POST generate：无状态生成，历史固定为空、context 原样透传', async () => {
    const { controller, uiResponse, flow } = makeController();

    const result = await controller.generate({
      input: '把这段结论渲染成卡片：结论可行，建议先做 P0',
      context: { sessionStage: 'result', collectedData: { requirementType: '功能需求' } },
    });

    expect(result.message).toBe('请选择需求类型');
    expect(uiResponse.generateUIResponse).toHaveBeenCalledWith(
      '把这段结论渲染成卡片：结论可行，建议先做 P0',
      [],
      { sessionStage: 'result', collectedData: { requirementType: '功能需求' } },
    );
    expect(flow.recordUserInput).not.toHaveBeenCalled();
    expect(flow.recordAssistantResponse).not.toHaveBeenCalled();
  });

  it('POST generate：LLM 503 时返回静态降级入口，不经过流程服务', async () => {
    const { controller, uiResponse, flow } = makeController();
    uiResponse.generateUIResponse.mockRejectedValue(
      new ServiceUnavailableException('LLM 未就绪'),
    );

    const result = await controller.generate({ input: '随便生成一个' });

    expect(result.message).toContain('暂不可用');
    expect(result.components[0]).toMatchObject({ type: 'action_buttons' });
    expect(result.context).toBeUndefined();
    expect(flow.buildDefaultEntry).not.toHaveBeenCalled();
  });

  it('POST generate：LLM 其他错误照常抛出；input 缺失抛 400', async () => {
    const { controller, uiResponse } = makeController();
    uiResponse.generateUIResponse.mockRejectedValue(new Error('模型输出解析失败'));
    await expect(controller.generate({ input: 'x' })).rejects.toThrow(/解析失败/);
    await expect(controller.generate({})).rejects.toThrow(/input/);
  });

  it('POST action：校验后委托 UiFlowService.handleAction', () => {
    const { controller, flow } = makeController();

    controller.handleAction({
      sessionId: 's1',
      action: { componentType: 'selection', payload: { type: 'select', selectedId: 'feature' } },
    });

    expect(flow.handleAction).toHaveBeenCalledWith('s1', {
      componentType: 'selection',
      payload: { type: 'select', selectedId: 'feature' },
    });
  });

  it('POST action：非法组件类型 / 非法 payload / 缺 sessionId 抛 400 语义错误', () => {
    const { controller } = makeController();
    expect(() =>
      controller.handleAction({
        sessionId: 's1',
        action: { componentType: 'widget', payload: { type: 'click', actionId: 'x' } } as never,
      }),
    ).toThrow(/未知的组件类型/);
    expect(() =>
      controller.handleAction({
        sessionId: 's1',
        action: { componentType: 'card', payload: { type: 'explode' } } as never,
      }),
    ).toThrow(/payload\.type/);
    expect(() => controller.handleAction({ action: { componentType: 'card', payload: { type: 'click', actionId: 'x' } } })).toThrow(
      /sessionId/,
    );
  });
});
