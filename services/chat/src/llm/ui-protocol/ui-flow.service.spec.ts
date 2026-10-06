import { describe, expect, it } from 'vitest';
import { UiFlowService } from './ui-flow.service.js';
import type { FormResponse, UIAction } from './ui-types.js';

function makeAction(componentType: UIAction['componentType'], payload: UIAction['payload']): UIAction {
  return { componentType, payload };
}

describe('UiFlowService', () => {
  it('selection：选择需求类型后进入详情收集阶段并返回表单', () => {
    const flow = new UiFlowService();

    const result = flow.handleAction(
      's1',
      makeAction('selection', { type: 'select', selectedId: 'feature' }),
    );

    expect(result.context?.sessionStage).toBe('collect_details');
    expect(result.context?.collectedData).toMatchObject({ requirementType: '新功能' });
    const form = result.components.find((c) => c.type === 'form') as FormResponse;
    expect(form.title).toContain('需求详情');
    expect(form.fields.map((f) => f.name)).toEqual([
      'name',
      'priority',
      'targetUsers',
      'description',
      'expectedDate',
      'budget',
    ]);
  });

  it('form：提交需求分析返回 confirmation + steps 组件', () => {
    const flow = new UiFlowService();
    flow.handleAction('s2', makeAction('selection', { type: 'select', selectedId: 'feature' }));

    const result = flow.handleAction('s2', makeAction('form', {
      type: 'submit',
      formData: {
        name: '会话记忆系统',
        priority: 'P0',
        description: '面向需求分析师的多轮会话记忆',
      },
    }));

    expect(result.context?.sessionStage).toBe('confirm');
    const types = result.components.map((c) => c.type);
    expect(types).toContain('confirmation');
    expect(types).toContain('steps');
    const confirmation = result.components.find((c) => c.type === 'confirmation')!;
    expect(JSON.stringify(confirmation)).toContain('会话记忆系统');
    expect(JSON.stringify(confirmation)).toContain('新功能');
    const steps = result.components.find((c) => c.type === 'steps')!;
    expect(steps).toMatchObject({ currentStep: 2 });
  });

  it('form：缺少必填字段时抛 400 语义错误', () => {
    const flow = new UiFlowService();
    expect(() =>
      flow.handleAction('s3', makeAction('form', {
        type: 'submit',
        formData: { name: '缺描述的需求' },
      })),
    ).toThrow(/需求描述/);
  });

  it('confirmation：确认后进入分析阶段，取消则退回表单', () => {
    const flow = new UiFlowService();
    flow.handleAction('s4', makeAction('selection', { type: 'select', selectedId: 'tech' }));
    flow.handleAction('s4', makeAction('form', {
      type: 'submit',
      formData: { name: '向量库迁移', priority: 'P1', description: '迁移到 pgvector' },
    }));

    const confirmed = flow.handleAction('s4', makeAction('confirmation', { type: 'confirm', confirmed: true }));
    expect(confirmed.context?.sessionStage).toBe('analyzing');
    expect(confirmed.components[0]).toMatchObject({ type: 'steps', currentStep: 3 });

    flow.handleAction('s5', makeAction('selection', { type: 'select', selectedId: 'tech' }));
    flow.handleAction('s5', makeAction('form', {
      type: 'submit',
      formData: { name: '另一个需求', priority: 'P2', description: '描述' },
    }));
    const cancelled = flow.handleAction('s5', makeAction('confirmation', { type: 'confirm', confirmed: false }));
    expect(cancelled.context?.sessionStage).toBe('collect_details');
    expect(cancelled.components.some((c) => c.type === 'form')).toBe(true);
  });

  it('table：行选择返回需求详情卡片', () => {
    const flow = new UiFlowService();

    const result = flow.handleAction('s6', makeAction('table', { type: 'row_select', rowIndex: 0 }));

    expect(result.components[0]).toMatchObject({
      type: 'card',
      title: '需求详情：会话记忆系统',
    });
    expect(JSON.stringify(result.components[0])).toContain('REQ-20240315-001');
  });

  it('card/action_buttons：查看报告进入完成阶段，再提需求重置流程', () => {
    const flow = new UiFlowService();
    flow.handleAction('s7', makeAction('table', { type: 'row_select', rowIndex: 0 }));

    const report = flow.handleAction('s7', makeAction('card', { type: 'click', actionId: 'view_report' }));
    expect(report.context?.sessionStage).toBe('completed');
    expect(report.components[0].type).toBe('card');

    const restart = flow.handleAction('s7', makeAction('action_buttons', { type: 'click', actionId: 'new_requirement' }));
    expect(restart.context?.sessionStage).toBe('intake');
    expect(restart.components[0].type).toBe('selection');

    const list = flow.handleAction('s7', makeAction('action_buttons', { type: 'click', actionId: 'view_requirements' }));
    expect(list.components[0]).toMatchObject({ type: 'table', selectable: true });
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

  it('recordUserInput/recordAssistantResponse：维护会话历史并暴露上下文', async () => {
    const flow = new UiFlowService();
    const first = flow.recordUserInput('s9', '我要提一个新需求');
    expect(first.stage).toBe('intake');
    expect(first.history).toEqual([]);

    flow.recordAssistantResponse('s9', {
      message: '请选择需求类型',
      components: [{ type: 'selection', title: 't', options: [{ id: 'feature', label: '新功能' }] }],
    });
    const second = flow.recordUserInput('s9', '选新功能');
    expect(second.history).toEqual([
      { role: 'user', content: '我要提一个新需求' },
      { role: 'assistant', content: '请选择需求类型\n[selection 组件]' },
    ]);
  });
});
