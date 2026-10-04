import path from 'node:path';

// workspace 根目录：默认 services/chat/workspace，可用 WORKSPACE_DIR 覆盖（容器挂载/测试）。
export function workspaceRoot(): string {
  return process.env.WORKSPACE_DIR
    ? path.resolve(process.env.WORKSPACE_DIR)
    : path.resolve(process.cwd(), 'workspace');
}

// 沙箱校验：把 workspace 内的相对路径解析为绝对路径，越界（../、绝对路径）即抛错。
export function safePath(relative: string): string {
  const root = workspaceRoot();
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`路径越界，仅允许访问 workspace 内的相对路径：${relative}`);
  }
  return resolved;
}
