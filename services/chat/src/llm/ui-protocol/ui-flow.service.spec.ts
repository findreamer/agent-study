import { describe, expect, it } from 'vitest';
import { UiFlowService } from './ui-flow.service.js';
import type { FormResponse, UIAction } from './ui-types.js';

function makeAction(componentType: UIAction['componentType'], payload: UIAction['payload']): UIAction {
  return { componentType, payload };
}

/** 按测试场景推进：选择类型 → 提交详情，返回会话所处阶段 */
function reachConfirmStage(flow: UiFlowService, sessionId: string): void {
  flow.handleAction(sessionId, makeAction('selection', { type: 'select', selectedId: 'functional' }));
  flow.handleAction(sessionId, makeAction('form', {
    type: 'submit',
    formData: {
      name: '会话记忆系统',
      priority: 'P0',
      description: '面向需求分析师的多轮会话记忆',
    },
  }));
}

describe('UiFlowService', () => {
  it('selection：选择需求类型后进入 fill_detail 阶段并返回表单', () => {
    const flow = new UiFlowService();

    const result = flow.handleAction(
      's1',
      makeAction('selection', { type: 'select', selectedId: 'functional' }),
    );

    expect(result.context?.sessionStage).toBe('fill_detail');
    expect(result.context?.collectedData).toMatchObject({ requirementType: '功能需求' });
    const form = result.components.find((c) => c.type === 'form') as FormResponse;
    expect(form.title).toContain('需求详情');
    expect(form.fields.map((f) => f.name)).toEqual([
      'name',
      'priority',
      'targetUsers',
      'description',
      'acceptanceCriteria',
      'expectedDate',
      'budget',
    ]);
  });

  it('form：提交需求详情后进入 confirm 阶段，返回 confirmation + card 组件', () => {
    const flow = new UiFlowService();
    flow.handleAction('s2', makeAction('selection', { type: 'select', selectedId: 'functional' }));

    const result = flow.handleAction('s2', makeAction('form', {
      type: 'submit',
      formData: {
        name: '会话记忆系统',
        priority: 'P0',
        description: '面向需求分析师的多轮会话记忆',
        expectedDate: '2026-12-01',
        budget: 30,
      },
    }));

    expect(result.context?.sessionStage).toBe('confirm');
    const types = result.components.map((c) => c.type);
    expect(types).toContain('confirmation');
    expect(types).toContain('card');
    const confirmation = result.components.find((c) => c.type === 'confirmation')!;
    expect(JSON.stringify(confirmation)).toContain('会话记忆系统');
    expect(JSON.stringify(confirmation)).toContain('功能需求');
    expect(confirmation).toMatchObject({ confirmLabel: '确认并开始分析', cancelLabel: '返回修改' });
    const card = result.components.find((c) => c.type === 'card')!;
    expect(card).toMatchObject({ title: '需求信息：会话记忆系统' });
    expect(JSON.stringify(card)).toContain('P0');
  });

  it('form：缺少必填字段时抛 400 语义错误，阶段不推进', () => {
    const flow = new UiFlowService();
    flow.handleAction('s3', makeAction('selection', { type: 'select', selectedId: 'tech' }));
    expect(() =>
      flow.handleAction('s3', makeAction('form', {
        type: 'submit',
        formData: { name: '缺描述的需求' },
      })),
    ).toThrow(/需求描述/);
  });

  it('confirmation：确认后进入 result 阶段返回 steps + action_buttons；取消回退到 fill_detail', () => {
    const flow = new UiFlowService();
    reachConfirmStage(flow, 's4');

    const confirmed = flow.handleAction('s4', makeAction('confirmation', { type: 'confirm', confirmed: true }));
    expect(confirmed.context?.sessionStage).toBe('result');
    expect(confirmed.components.map((c) => c.type)).toEqual(['steps', 'action_buttons']);
    expect(confirmed.components[0]).toMatchObject({ type: 'steps', currentStep: 3 });
    expect(JSON.stringify(confirmed.components[1])).toContain('查看分析报告');

    reachConfirmStage(flow, 's5');
    const cancelled = flow.handleAction('s5', makeAction('confirmation', { type: 'confirm', confirmed: false }));
    expect(cancelled.context?.sessionStage).toBe('fill_detail');
    expect(cancelled.components.some((c) => c.type === 'form')).toBe(true);
  });

  it('回退后可重新提交并再次到达 confirm 阶段（回退不破坏状态机）', () => {
    const flow = new UiFlowService();
    reachConfirmStage(flow, 's4b');
    flow.handleAction('s4b', makeAction('confirmation', { type: 'confirm', confirmed: false }));

    const resubmit = flow.handleAction('s4b', makeAction('form', {
      type: 'submit',
      formData: { name: '修订后的需求', priority: 'P1', description: '修改后的描述' },
    }));
    expect(resubmit.context?.sessionStage).toBe('confirm');
    expect(JSON.stringify(resubmit.components)).toContain('修订后的需求');
  });

  it('table：行选择返回需求详情卡片，阶段不推进', () => {
    const flow = new UiFlowService();

    const result = flow.handleAction('s6', makeAction('table', { type: 'row_select', rowIndex: 0 }));

    expect(result.context?.sessionStage).toBe('select_type');
    expect(result.components[0]).toMatchObject({
      type: 'card',
      title: '需求详情：会话记忆系统',
    });
    expect(JSON.stringify(result.components[0])).toContain('REQ-20240315-001');
  });

  it('card/action_buttons：查看报告、查看列表；再提需求重置回 select_type', () => {
    const flow = new UiFlowService();
    reachConfirmStage(flow, 's7');
    flow.handleAction('s7', makeAction('confirmation', { type: 'confirm', confirmed: true }));

    const report = flow.handleAction('s7', makeAction('action_buttons', { type: 'click', actionId: 'view_report' }));
    expect(report.context?.sessionStage).toBe('result');
    expect(report.components[0].type).toBe('card');

    const list = flow.handleAction('s7', makeAction('action_buttons', { type: 'click', actionId: 'view_requirements' }));
    expect(list.components[0]).toMatchObject({ type: 'table', selectable: true });

    const restart = flow.handleAction('s7', makeAction('action_buttons', { type: 'click', actionId: 'new_requirement' }));
    expect(restart.context?.sessionStage).toBe('select_type');
    expect(restart.context?.collectedData).toEqual({});
    expect(restart.components[0].type).toBe('selection');
  });

  it('阶段守卫：select_type 阶段直接提交表单不推进，重发 selection 组件', () => {
    const flow = new UiFlowService();

    const result = flow.handleAction('g1', makeAction('form', {
      type: 'submit',
      formData: { name: '跳过类型选择的需求', priority: 'P0', description: '描述' },
    }));

    expect(result.context?.sessionStage).toBe('select_type');
    expect(result.components.map((c) => c.type)).toEqual(['selection']);
  });

  it('阶段守卫：fill_detail 阶段重复选类型不回退，重发表单并保留已收集数据', () => {
    const flow = new UiFlowService();
    flow.handleAction('g2', makeAction('selection', { type: 'select', selectedId: 'functional' }));

    const result = flow.handleAction('g2', makeAction('selection', { type: 'select', selectedId: 'tech' }));

    expect(result.context?.sessionStage).toBe('fill_detail');
    expect(result.context?.collectedData).toMatchObject({ requirementType: '功能需求' });
    expect(result.components.map((c) => c.type)).toEqual(['form']);
  });

  it('阶段守卫：confirm 阶段收到表单提交，重发 confirmation + card', () => {
    const flow = new UiFlowService();
    reachConfirmStage(flow, 'g3');

    const result = flow.handleAction('g3', makeAction('form', {
      type: 'submit',
      formData: { name: '乱序提交', priority: 'P1', description: '描述' },
    }));

    expect(result.context?.sessionStage).toBe('confirm');
    expect(result.components.map((c) => c.type)).toEqual(['confirmation', 'card']);
  });

  it('阶段守卫：result 阶段收到确认操作，重发 steps + action_buttons', () => {
    const flow = new UiFlowService();
    reachConfirmStage(flow, 'g4');
    flow.handleAction('g4', makeAction('confirmation', { type: 'confirm', confirmed: true }));

    const result = flow.handleAction('g4', makeAction('confirmation', { type: 'confirm', confirmed: true }));

    expect(result.context?.sessionStage).toBe('result');
    expect(result.components.map((c) => c.type)).toEqual(['steps', 'action_buttons']);
  });

  it('非阶段绑定交互任意阶段可用：select_type 阶段点击查看列表', () => {
    const flow = new UiFlowService();

    const result = flow.handleAction('g5', makeAction('action_buttons', { type: 'click', actionId: 'view_requirements' }));

    expect(result.context?.sessionStage).toBe('select_type');
    expect(result.components[0]).toMatchObject({ type: 'table', selectable: true });
  });

  it('rawInput 预填：chat 输入的原话进入表单描述字段 defaultValue', () => {
    const flow = new UiFlowService();
    flow.recordUserInput('g6', '我要提一个新需求：用户希望能够批量导入 Excel 数据');

    const result = flow.handleAction('g6', makeAction('selection', { type: 'select', selectedId: 'functional' }));

    const form = result.components.find((c) => c.type === 'form') as FormResponse;
    const description = form.fields.find((f) => f.name === 'description')!;
    expect(description.defaultValue).toContain('批量导入 Excel 数据');
  });

  it('buildDefaultEntry：LLM 不可用时返回快捷操作入口', () => {
    const flow = new UiFlowService();

    const result = flow.buildDefaultEntry('g7');

    expect(result.message).toContain('快捷操作');
    expect(result.components[0]).toMatchObject({ type: 'action_buttons' });
    expect(result.context?.sessionStage).toBe('select_type');
  });

  it('非法操作：payload 类型与组件不匹配、未知 actionId、行越界均抛 400 语义错误', () => {
    const flow = new UiFlowService();
    expect(() =>
      flow.handleAction('s8', makeAction('selection', { type: 'confirm', confirmed: true })),
    ).toThrow(/select/);
    expect(() =>
      flow.handleAction('s8', makeAction('action_buttons', { type: 'click', actionId: 'nope' })),
    ).toThrow(/未知操作/);
    expect(() =>
      flow.handleAction('s8', makeAction('table', { type: 'row_select', rowIndex: 99 })),
    ).toThrow(/越界/);
    expect(() =>
      flow.handleAction('s8', makeAction('text', { type: 'click', actionId: 'x' })),
    ).toThrow(/不支持 UI 操作/);
  });

  it('recordUserInput/recordAssistantResponse：维护会话历史并暴露上下文', () => {
    const flow = new UiFlowService();
    const first = flow.recordUserInput('s9', '我要提一个新需求');
    expect(first.stage).toBe('select_type');
    expect(first.history).toEqual([]);

    flow.recordAssistantResponse('s9', {
      message: '请选择需求类型',
      components: [{ type: 'selection', title: 't', options: [{ id: 'functional', label: '功能需求' }] }],
    });
    const second = flow.recordUserInput('s9', '选功能需求');
    expect(second.history).toEqual([
      { role: 'user', content: '我要提一个新需求' },
      { role: 'assistant', content: '请选择需求类型\n[selection 组件]' },
    ]);
  });
});
