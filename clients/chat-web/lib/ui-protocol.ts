// UI 响应协议的前端类型副本，与服务端 services/chat/src/llm/ui-protocol/ui-types.ts 保持一致。
// 有意不跨包引用：前端只依赖这份轻量契约，协议演进时便于替换或下沉到 @agent-study/contracts。

export interface TextResponse {
  type: "text";
  content: string;
}

export interface SelectionOption {
  id: string;
  label: string;
  description?: string;
  icon?: string;
}

export interface SelectionResponse {
  type: "selection";
  title: string;
  options: SelectionOption[];
  allowMultiple?: boolean;
}

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormField {
  name: string;
  label: string;
  type: "input" | "select" | "textarea" | "date" | "number";
  required?: boolean;
  options?: FormFieldOption[];
  placeholder?: string;
  defaultValue?: string;
}

export interface FormResponse {
  type: "form";
  title: string;
  fields: FormField[];
  submitLabel?: string;
}

export interface ConfirmationResponse {
  type: "confirmation";
  title: string;
  summary: string[];
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface CardField {
  label: string;
  value: string;
}

export interface CardAction {
  id: string;
  label: string;
}

export interface CardResponse {
  type: "card";
  title: string;
  fields: CardField[];
  actions?: CardAction[];
}

export interface StepItem {
  label: string;
  description?: string;
}

export interface StepsResponse {
  type: "steps";
  steps: StepItem[];
  currentStep: number;
}

export interface TableColumn {
  key: string;
  title: string;
}

export type TableRow = Record<string, string | number | boolean | null>;

export interface TableResponse {
  type: "table";
  columns: TableColumn[];
  rows: TableRow[];
  selectable?: boolean;
}

export interface ActionButton {
  id: string;
  label: string;
  style?: "primary" | "default" | "danger";
}

export interface ActionButtonsResponse {
  type: "action_buttons";
  buttons: ActionButton[];
  layout?: "horizontal" | "vertical";
}

export type UIResponse =
  | TextResponse
  | SelectionResponse
  | FormResponse
  | ConfirmationResponse
  | CardResponse
  | StepsResponse
  | TableResponse
  | ActionButtonsResponse;

export type UIComponentType = UIResponse["type"];

export interface AIUIResponse {
  message: string;
  components: UIResponse[];
  context?: {
    sessionStage?: string;
    collectedData?: Record<string, unknown>;
  };
}

export type UIActionPayload =
  | { type: "select"; selectedId: string | string[] }
  | { type: "submit"; formData: Record<string, unknown> }
  | { type: "confirm"; confirmed: boolean }
  | { type: "click"; actionId: string }
  | { type: "row_select"; rowIndex: number };

export interface UIAction {
  componentType: UIComponentType;
  payload: UIActionPayload;
}
