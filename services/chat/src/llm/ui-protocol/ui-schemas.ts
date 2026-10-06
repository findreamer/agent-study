import { z } from 'zod';
import type { AIUIResponse, UIResponse } from './ui-types.js';

// 每个 schema 的字段与 ui-types.ts 手写类型一一对应，文件底部做编译期双向校验

export const textResponseSchema = z.object({
  type: z.literal('text'),
  content: z.string().min(1),
});

export const selectionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  icon: z.string().optional(),
});

export const selectionResponseSchema = z.object({
  type: z.literal('selection'),
  title: z.string().min(1),
  options: z.array(selectionOptionSchema).min(1),
  allowMultiple: z.boolean().optional(),
});

export const formFieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['input', 'select', 'textarea', 'date', 'number']),
  required: z.boolean().optional(),
  options: z.array(
    z.object({ value: z.string(), label: z.string() }),
  ).optional(),
  placeholder: z.string().optional(),
});

export const formResponseSchema = z.object({
  type: z.literal('form'),
  title: z.string().min(1),
  fields: z.array(formFieldSchema).min(1),
  submitLabel: z.string().optional(),
});

export const confirmationResponseSchema = z.object({
  type: z.literal('confirmation'),
  title: z.string().min(1),
  summary: z.array(z.string()).min(1),
  warning: z.string().optional(),
  confirmLabel: z.string().optional(),
  cancelLabel: z.string().optional(),
});

export const cardResponseSchema = z.object({
  type: z.literal('card'),
  title: z.string().min(1),
  fields: z.array(
    z.object({ label: z.string(), value: z.string() }),
  ),
  actions: z.array(
    z.object({ id: z.string(), label: z.string() }),
  ).optional(),
});

export const stepsResponseSchema = z.object({
  type: z.literal('steps'),
  steps: z.array(
    z.object({
      label: z.string(),
      description: z.string().optional(),
    }),
  ).min(1),
  currentStep: z.number().int().min(0),
});

export const tableResponseSchema = z.object({
  type: z.literal('table'),
  columns: z.array(
    z.object({ key: z.string(), title: z.string() }),
  ).min(1),
  rows: z.array(
    z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  ),
  selectable: z.boolean().optional(),
});

export const actionButtonsResponseSchema = z.object({
  type: z.literal('action_buttons'),
  buttons: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      style: z.enum(['primary', 'default', 'danger']).optional(),
    }),
  ).min(1),
  layout: z.enum(['horizontal', 'vertical']).optional(),
});

// 基于 type 字段做精确匹配的联合 schema
export const uiResponseSchema = z.discriminatedUnion('type', [
  textResponseSchema,
  selectionResponseSchema,
  formResponseSchema,
  confirmationResponseSchema,
  cardResponseSchema,
  stepsResponseSchema,
  tableResponseSchema,
  actionButtonsResponseSchema,
]);

export const uiContextSchema = z.object({
  sessionStage: z.string().optional(),
  collectedData: z.record(z.string(), z.unknown()).optional(),
});

export const aiUIResponseSchema = z.object({
  message: z.string().min(1),
  components: z.array(uiResponseSchema).default([]),
  context: uiContextSchema.optional(),
});

export type UIResponseFromSchema = z.infer<typeof uiResponseSchema>;
export type AIUIResponseFromSchema = z.infer<typeof aiUIResponseSchema>;

// 编译期双向校验：schema 推导类型与 ui-types.ts 手写类型必须一致，防止两头漂移
const _schemaToType: UIResponse = {} as UIResponseFromSchema;
const _typeToSchema: UIResponseFromSchema = {} as UIResponse;
const _aiSchemaToType: AIUIResponse = {} as AIUIResponseFromSchema;
const _aiTypeToSchema: AIUIResponseFromSchema = {} as AIUIResponse;
void _schemaToType;
void _typeToSchema;
void _aiSchemaToType;
void _aiTypeToSchema;
