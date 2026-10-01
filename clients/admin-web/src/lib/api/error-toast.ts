import { toast } from '@heroui/react';
import { ApiError } from './client';

interface ToastErrorOptions {
  /** 409 冲突时的定制文案（如「用户名已存在」） */
  conflict?: string;
  /** 兜底文案 */
  fallback?: string;
}

/** 统一 API 错误 Toast：403 固定提示权限已变更，409/422 展示定制或字段信息。 */
export function toastApiError(e: unknown, opts: ToastErrorOptions = {}): void {
  if (e instanceof ApiError) {
    if (e.status === 403) {
      toast('权限已变更，请刷新', { variant: 'danger' });
      return;
    }
    if (e.status === 409 && opts.conflict) {
      toast(opts.conflict, { variant: 'danger' });
      return;
    }
    const issueMessage =
      Array.isArray(e.issues) && e.issues.length > 0
        ? (e.issues[0] as { message?: string }).message
        : undefined;
    toast(opts.fallback ?? issueMessage ?? e.message ?? '操作失败', {
      variant: 'danger',
    });
    return;
  }
  toast(opts.fallback ?? '网络异常，请稍后重试', { variant: 'danger' });
}
