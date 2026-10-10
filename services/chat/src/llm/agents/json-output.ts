const PREVIEW_LIMIT = 200;

/** 从模型输出中提取 JSON：容忍 markdown 代码围栏与前后缀文本。 */
export function extractJson(raw: string): Record<string, unknown> {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error(`输出中不包含 JSON：${raw.slice(0, PREVIEW_LIMIT)}`);
  }
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
}
