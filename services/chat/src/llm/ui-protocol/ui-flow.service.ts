import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AIUIResponse,
  ActionButtonsResponse,
  CardResponse,
  ConfirmationResponse,
  FormResponse,
  SelectionResponse,
  StepsResponse,
  TableResponse,
  UIAction,
  UIResponse,
} from './ui-types.js';

// 需求分析流程四阶段状态机
export type UIFlowStage = 'select_type' | 'fill_detail' | 'confirm' | 'result';

export const FLOW_STEPS: { label: string; description: string }[] = [
  { label: '选择需求类型', description: '功能 / 体验 / 技术需求' },
  { label: '填写需求详情', description: '名称、优先级、描述等' },
  { label: '确认提交分析', description: '核对需求摘要' },
  { label: '分析结果', description: '分析进度与后续操作' },
];

const STAGE_INDEX: Record<UIFlowStage, number> = {
  select_type: 0,
  fill_detail: 1,
  confirm: 2,
  result: 3,
};

const REQUIREMENT_TYPES: SelectionResponse = {
  type: 'selection',
  title: '请选择需求类型',
  options: [
    {
      id: 'functional',
      label: '功能需求',
      description: '面向用户新增或改进的业务能力',
      icon: '✨',
    },
    {
      id: 'experience',
      label: '体验需求',
      description: '交互、性能与可用性优化',
      icon: '🚀',
    },
    {
      id: 'tech',
      label: '技术需求',
      description: '重构、技术债与基础设施',
      icon: '🛠️',
    },
  ],
};

const REQUIREMENT_TYPE_LABELS: Record<string, string> = {
  functional: '功能需求',
  experience: '体验需求',
  tech: '技术需求',
};

const REQUIREMENT_FORM: FormResponse = {
  type: 'form',
  title: '请补充需求详情',
  fields: [
    { name: 'name', label: '需求名称', type: 'input', required: true },
    {
      name: 'priority',
      label: '优先级',
      type: 'select',
      required: true,
      options: [
        { value: 'P0', label: 'P0（立即排期）' },
        { value: 'P1', label: 'P1（本迭代）' },
        { value: 'P2', label: 'P2（排期待定）' },
      ],
    },
    { name: 'targetUsers', label: '目标用户', type: 'input' },
    {
      name: 'description',
      label: '需求描述',
      type: 'textarea',
      required: true,
      placeholder: '描述业务背景、要解决的问题与预期效果',
    },
    { name: 'expectedDate', label: '期望上线日期', type: 'date' },
    { name: 'budget', label: '预算（万元）', type: 'number' },
  ],
  submitLabel: '提交需求分析',
};

const RESULT_ACTIONS: ActionButtonsResponse = {
  type: 'action_buttons',
  buttons: [
    { id: 'view_report', label: '查看分析报告', style: 'primary' },
    { id: 'view_requirements', label: '查看需求列表' },
    { id: 'new_requirement', label: '再提一个需求' },
  ],
  layout: 'horizontal',
};

// 演示用需求列表数据，table / card 组件的展示载体
const REQUIREMENT_TABLE: TableResponse = {
  type: 'table',
  columns: [
    { key: 'id', title: '需求编号' },
    { key: 'name', title: '需求名称' },
    { key: 'type', title: '类型' },
    { key: 'priority', title: '优先级' },
    { key: 'status', title: '状态' },
  ],
  rows: [
    {
      id: 'REQ-20240315-001',
      name: '会话记忆系统',
      type: '功能需求',
      priority: 'P0',
      status: '分析中',
    },
    {
      id: 'REQ-20240312-004',
      name: '文档检索性能优化',
      type: '体验需求',
      priority: 'P1',
      status: '已确认',
    },
    {
      id: 'REQ-20240301-009',
      name: '向量库迁移 pgvector',
      type: '技术需求',
      priority: 'P2',
      status: '已完成',
    },
  ],
  selectable: true,
};

const FIELD_LABELS: Record<string, string> = {
  name: '需求名称',
  priority: '优先级',
  targetUsers: '目标用户',
  description: '需求描述',
  expectedDate: '期望上线日期',
  budget: '预算（万元）',
};

interface UISession {
  stage: UIFlowStage;
  collectedData: Record<string, unknown>;
  history: { role: 'user' | 'assistant'; content: string }[];
  updatedAt: number;
}

const MAX_SESSIONS = 500;

@Injectable()
export class UiFlowService {
  private readonly sessions = new Map<string, UISession>();

  /** chat 入口：记录用户输入并返回会话上下文，供 LLM 生成时感知流程进度 */
  recordUserInput(sessionId: string, input: string): {
    stage: UIFlowStage;
    collectedData: Record<string, unknown>;
    history: { role: 'user' | 'assistant'; content: string }[];
  } {
    const session = this.getOrCreate(sessionId);
    session.history.push({ role: 'user', content: input });
    session.updatedAt = Date.now();
    return {
      stage: session.stage,
      collectedData: session.collectedData,
      history: session.history.slice(0, -1),
    };
  }

  /** chat 入口：记录模型的结构化回复，保持会话历史完整 */
  recordAssistantResponse(sessionId: string, response: AIUIResponse): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.history.push({
      role: 'assistant',
      content: [response.message, ...response.components.map((c) => `[${c.type} 组件]`)].join('\n'),
    });
    session.updatedAt = Date.now();
  }

  /** action 入口：根据用户在 UI 上的操作推进（或回退）状态机 */
  handleAction(sessionId: string, action: UIAction): AIUIResponse {
    const session = this.getOrCreate(sessionId);
    session.updatedAt = Date.now();

    const respond = (
      stage: UIFlowStage,
      message: string,
      components: UIResponse[],
      collectedDataPatch?: Record<string, unknown>,
    ): AIUIResponse => {
      session.stage = stage;
      if (collectedDataPatch) {
        session.collectedData = { ...session.collectedData, ...collectedDataPatch };
      }
      return {
        message,
        components,
        context: {
          sessionStage: stage,
          collectedData: session.collectedData,
        },
      };
    };

    switch (action.componentType) {
      case 'selection':
        return this.handleSelection(session, action, respond);
      case 'form':
        return this.handleFormSubmit(session, action, respond);
      case 'confirmation':
        return this.handleConfirmation(session, action, respond);
      case 'table':
        return this.handleRowSelect(session, action, respond);
      case 'card':
      case 'action_buttons':
        return this.handleClick(session, action, respond);
      default:
        throw new BadRequestException(
          `组件类型 ${action.componentType} 不支持 UI 操作回传`,
        );
    }
  }

  /** Stage 1 → 2：选择需求类型后进入详情填写 */
  private handleSelection(
    session: UISession,
    action: UIAction,
    respond: RespondFn,
  ): AIUIResponse {
    if (action.payload.type !== 'select') {
      throw new BadRequestException('selection 组件只接受 select 操作');
    }
    const selected = action.payload.selectedId;
    const typeId = Array.isArray(selected) ? selected[0] : selected;
    if (!typeId) {
      throw new BadRequestException('selectedId 不能为空');
    }
    const typeLabel = REQUIREMENT_TYPE_LABELS[typeId] ?? typeId;
    return respond(
      'fill_detail',
      `已选择「${typeLabel}」，请补充需求详情后提交。`,
      [REQUIREMENT_FORM],
      { requirementType: typeLabel },
    );
  }

  /** Stage 2 → 3：提交需求详情，返回确认摘要 + 需求信息卡 */
  private handleFormSubmit(
    session: UISession,
    action: UIAction,
    respond: RespondFn,
  ): AIUIResponse {
    if (action.payload.type !== 'submit') {
      throw new BadRequestException('form 组件只接受 submit 操作');
    }
    const formData = action.payload.formData;
    const missing = REQUIREMENT_FORM.fields
      .filter((field) => field.required && !formData[field.name])
      .map((field) => field.label);
    if (missing.length) {
      throw new BadRequestException(`缺少必填字段：${missing.join('、')}`);
    }
    const confirmation = this.buildConfirmation(formData, session.collectedData);
    const card = this.buildRequirementCard(formData, session.collectedData);
    return respond(
      'confirm',
      '需求详情已提交，请核对摘要；确认后将开始需求分析。',
      [confirmation, card],
      { requirementForm: formData },
    );
  }

  /** Stage 3 → 4：确认进入结果阶段；取消则回退到 Stage 2 */
  private handleConfirmation(
    session: UISession,
    action: UIAction,
    respond: RespondFn,
  ): AIUIResponse {
    if (action.payload.type !== 'confirm') {
      throw new BadRequestException('confirmation 组件只接受 confirm 操作');
    }
    if (!action.payload.confirmed) {
      return respond(
        'fill_detail',
        '已取消确认，请修改需求详情后重新提交。',
        [REQUIREMENT_FORM],
      );
    }
    return respond(
      'result',
      '需求已确认，需求分析流程启动：抽取 → 澄清 → 分析 → 风险 → 汇总，可随时查看进度与后续操作。',
      [this.buildSteps('result'), RESULT_ACTIONS],
    );
  }

  /** table 行选择：展示需求详情卡片，不推进阶段 */
  private handleRowSelect(
    session: UISession,
    action: UIAction,
    respond: RespondFn,
  ): AIUIResponse {
    if (action.payload.type !== 'row_select') {
      throw new BadRequestException('table 组件只接受 row_select 操作');
    }
    const rowIndex = action.payload.rowIndex;
    const row = REQUIREMENT_TABLE.rows[rowIndex];
    if (!row) {
      throw new BadRequestException(`行下标越界：${rowIndex}`);
    }
    const card: CardResponse = {
      type: 'card',
      title: `需求详情：${String(row.name)}`,
      fields: REQUIREMENT_TABLE.columns.map((column) => ({
        label: column.title,
        value: String(row[column.key]),
      })),
      actions: [{ id: 'view_report', label: '查看分析报告' }],
    };
    return respond(session.stage, `已选中需求 ${String(row.id)}。`, [card]);
  }

  /** 卡片/按钮组点击：查看报告、查看列表、再提需求（重置流程） */
  private handleClick(
    session: UISession,
    action: UIAction,
    respond: RespondFn,
  ): AIUIResponse {
    if (action.payload.type !== 'click') {
      throw new BadRequestException(`${action.componentType} 组件只接受 click 操作`);
    }
    switch (action.payload.actionId) {
      case 'new_requirement':
        session.collectedData = {};
        return respond('select_type', '已开启新的需求，请选择需求类型。', [REQUIREMENT_TYPES]);
      case 'view_requirements':
        return respond(session.stage, '当前需求列表如下，点击行可查看详情。', [
          REQUIREMENT_TABLE,
        ]);
      case 'view_report':
        return respond(session.stage === 'confirm' ? 'result' : session.stage, '需求分析报告如下。', [
          {
            type: 'card',
            title: '需求分析报告：会话记忆系统',
            fields: [
              { label: '结论', value: '可行，建议先做 P0' },
              { label: '功能分解', value: '多轮澄清 / 上下文裁剪 / 记忆持久化' },
              { label: '主要风险', value: '长上下文成本，等级：中' },
            ],
            actions: [{ id: 'new_requirement', label: '再提一个需求' }],
          },
        ]);
      default:
        throw new BadRequestException(`未知操作：${action.payload.actionId}`);
    }
  }

  private buildSteps(stage: UIFlowStage): StepsResponse {
    return { type: 'steps', steps: FLOW_STEPS, currentStep: STAGE_INDEX[stage] };
  }

  private buildConfirmation(
    formData: Record<string, unknown>,
    collectedData: Record<string, unknown>,
  ): ConfirmationResponse {
    const summary: string[] = [];
    if (collectedData.requirementType) {
      summary.push(`需求类型：${String(collectedData.requirementType)}`);
    }
    for (const [key, label] of Object.entries(FIELD_LABELS)) {
      if (formData[key] !== undefined && formData[key] !== '') {
        summary.push(`${label}：${String(formData[key])}`);
      }
    }
    return {
      type: 'confirmation',
      title: '请确认需求摘要',
      summary,
      confirmLabel: '确认并开始分析',
      cancelLabel: '返回修改',
    };
  }

  private buildRequirementCard(
    formData: Record<string, unknown>,
    collectedData: Record<string, unknown>,
  ): CardResponse {
    const fields: CardResponse['fields'] = [];
    if (collectedData.requirementType) {
      fields.push({ label: '需求类型', value: String(collectedData.requirementType) });
    }
    for (const [key, label] of Object.entries(FIELD_LABELS)) {
      if (formData[key] !== undefined && formData[key] !== '') {
        fields.push({ label, value: String(formData[key]) });
      }
    }
    return {
      type: 'card',
      title: `需求信息：${String(formData['name'] ?? '未命名需求')}`,
      fields,
    };
  }

  private getOrCreate(sessionId: string): UISession {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    if (this.sessions.size >= MAX_SESSIONS) {
      const oldest = [...this.sessions.entries()].sort(
        (a, b) => a[1].updatedAt - b[1].updatedAt,
      )[0];
      if (oldest) this.sessions.delete(oldest[0]);
    }
    const session: UISession = {
      stage: 'select_type',
      collectedData: {},
      history: [],
      updatedAt: Date.now(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }
}

type RespondFn = (
  stage: UIFlowStage,
  message: string,
  components: UIResponse[],
  collectedDataPatch?: Record<string, unknown>,
) => AIUIResponse;
