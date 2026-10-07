import type { Response } from 'express';

/** 手写 SSE 帧格式：event + 单行 JSON data */
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** 请求级 SSE 响应的公共头部（流式回复 = 响应本身，无需跨请求注册连接） */
export function openSse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('retry: 3000\n\n');
}
