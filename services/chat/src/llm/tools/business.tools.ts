import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tool, type StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { safePath } from '../filesystem/workspace.js';

// 单次读入上限，防止超大文件挤爆上下文预算
const READ_CAP = 12000;

async function readWorkspaceFile(relative: string): Promise<string> {
  let file: string;
  try {
    file = safePath(relative);
  } catch (error) {
    return `读取失败：${error instanceof Error ? error.message : String(error)}`;
  }
  try {
    const content = await readFile(file, 'utf-8');
    return content.length > READ_CAP
      ? `${content.slice(0, READ_CAP)}\n…（内容过长，已截断）`
      : content;
  } catch {
    return `未找到文件：${relative}`;
  }
}

export const readFileTool = tool(
  ({ path: relative }) => readWorkspaceFile(relative),
  {
    name: 'read_file',
    description:
      '读取 workspace 内的文件内容（规范、标准、既有报告等）。path 是 workspace 内的相对路径，不带 workspace/ 前缀，例如 standards/requirement-spec.md',
    schema: z.object({
      path: z.string().describe('workspace 内的相对路径，例如 standards/requirement-spec.md'),
    }),
  },
);

export const queryRequirement = tool(
  ({ requirementId }) =>
    readWorkspaceFile(
      `requirements/${requirementId.trim().replace(/\.json$/i, '')}.json`,
    ),
  {
    name: 'query_requirement',
    description:
      '根据需求单号查询需求单详情，读取 workspace/requirements/{requirementId}.json，返回需求的 JSON 原文',
    schema: z.object({
      requirementId: z
        .string()
        .describe('需求单号，例如 REQ-2026-001（带不带 .json 后缀均可）'),
    }),
  },
);

export const writeFileTool = tool(
  async ({ path: relative, content }) => {
    let file: string;
    try {
      file = safePath(relative);
    } catch (error) {
      return `写入失败：${error instanceof Error ? error.message : String(error)}`;
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content, 'utf-8');
    return JSON.stringify({ ok: true, path: relative, bytes: content.length });
  },
  {
    name: 'write_file',
    description:
      '把内容写入 workspace 内的文件（分析报告等制品），目录不存在时自动创建。path 是 workspace 内的相对路径，不带 workspace/ 前缀',
    schema: z.object({
      path: z.string().describe('workspace 内的相对路径，例如 reports/REQ-2026-001-analysis.md'),
      content: z.string().describe('要写入的完整文件内容'),
    }),
  },
);

export const businessTools = [queryRequirement, readFileTool, writeFileTool];

export const businessToolsByName: Record<string, StructuredTool> = {
  [queryRequirement.name]: queryRequirement,
  [readFileTool.name]: readFileTool,
  [writeFileTool.name]: writeFileTool,
};
