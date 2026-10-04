import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  queryRequirement,
  readFileTool,
  writeFileTool,
} from './business.tools.js';

let workspaceDir: string;
let originalWorkspaceDir: string | undefined;

beforeEach(() => {
  workspaceDir = mkdtempSync(path.join(tmpdir(), 'ws-'));
  originalWorkspaceDir = process.env.WORKSPACE_DIR;
  process.env.WORKSPACE_DIR = workspaceDir;
});

afterEach(() => {
  if (originalWorkspaceDir === undefined) delete process.env.WORKSPACE_DIR;
  else process.env.WORKSPACE_DIR = originalWorkspaceDir;
});

function seed(relative: string, content: string): void {
  const file = path.join(workspaceDir, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

describe('write_file / read_file', () => {
  it('写入会自动创建多级目录，内容可回读', async () => {
    const writeResult = await writeFileTool.invoke({
      path: 'reports/nested/REQ-1.md',
      content: '# 分析结论\n内容OK',
    } as never);
    expect(String(writeResult)).toContain('"ok":true');

    const readResult = await readFileTool.invoke({
      path: 'reports/nested/REQ-1.md',
    } as never);
    expect(String(readResult)).toContain('分析结论');
  });

  it('read_file 读取不存在文件返回明确提示', async () => {
    const result = await readFileTool.invoke({
      path: 'standards/nope.md',
    } as never);
    expect(String(result)).toContain('未找到');
  });

  it('相对路径越界（../）被沙箱拦截', async () => {
    const result = await readFileTool.invoke({
      path: '../escape.txt',
    } as never);
    expect(String(result)).toContain('越界');
  });

  it('绝对路径被沙箱拦截', async () => {
    const result = await writeFileTool.invoke({
      path: '/tmp/absolute-attack.md',
      content: 'x',
    } as never);
    expect(String(result)).toContain('越界');
  });
});

describe('query_requirement', () => {
  it('按需求单号读取 requirements/{id}.json', async () => {
    seed(
      'requirements/REQ-2026-001.json',
      JSON.stringify({ id: 'REQ-2026-001', title: '需求分析助手' }),
    );
    const result = await queryRequirement.invoke({
      requirementId: 'REQ-2026-001',
    } as never);
    expect(String(result)).toContain('REQ-2026-001');
    expect(String(result)).toContain('需求分析助手');
  });

  it('单号带 .json 后缀时也能命中', async () => {
    seed(
      'requirements/REQ-2.json',
      JSON.stringify({ id: 'REQ-2', title: '二号需求' }),
    );
    const result = await queryRequirement.invoke({
      requirementId: 'REQ-2.json',
    } as never);
    expect(String(result)).toContain('二号需求');
  });

  it('单号不存在时返回未找到提示', async () => {
    const result = await queryRequirement.invoke({
      requirementId: 'REQ-404',
    } as never);
    expect(String(result)).toContain('未找到');
  });

  it('单号夹带路径穿越被沙箱拦截', async () => {
    const result = await queryRequirement.invoke({
      requirementId: '../../etc/passwd',
    } as never);
    expect(String(result)).toMatch(/越界|未找到/);
  });

  it('沙箱外的真实文件确实读不到', async () => {
    const outside = path.join(workspaceDir, '..', 'ws-outside-secret.txt');
    writeFileSync(outside, 'SECRET');
    const result = await readFileTool.invoke({
      path: '../ws-outside-secret.txt',
    } as never);
    expect(String(result)).not.toContain('SECRET');
    readFileSync(outside); // 确认文件本身存在，排除误报
  });
});
