import { describe, expect, it, vi } from 'vitest';
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
