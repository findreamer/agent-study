"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  clearToken,
  getStoredToken,
  login,
  apiPost,
  storeToken,
  streamSse,
} from "@/lib/api";
import type { AIUIResponse, UIAction, UIResponse } from "@/lib/ui-protocol";
import { ComponentRenderer } from "./ComponentRenderer";
import { StreamProgress } from "./StreamProgress";
import type { StreamStageState } from "./StreamProgress";

interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  text?: string;
  components?: UIResponse[];
  error?: string;
  stream?: StreamStageState;
}

// 与后端五 Agent 流水线一致的阶段标签
const ANALYSIS_STAGES = ["需求提取", "澄清判断", "多维度分析", "风险评估", "综合报告"];

let entrySeq = 0;
function nextEntryId(): string {
  entrySeq += 1;
  return `entry-${entrySeq}`;
}

export function AIChatContainer() {
  const [token, setToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const sessionIdRef = useRef<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionIdRef.current = crypto.randomUUID();
    setToken(getStoredToken());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  const appendAssistant = useCallback((response: AIUIResponse) => {
    setEntries((prev) => [
      ...prev,
      {
        id: nextEntryId(),
        role: "assistant",
        text: response.message,
        components: response.components,
      },
    ]);
  }, []);

  const patchEntry = useCallback((id: string, patch: (entry: ChatEntry) => ChatEntry) => {
    setEntries((prev) => prev.map((entry) => (entry.id === id ? patch(entry) : entry)));
  }, []);

  const handleLogin = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const accessToken = await login(username.trim(), password);
      storeToken(accessToken);
      setToken(accessToken);
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "登录失败");
    } finally {
      setAuthLoading(false);
    }
  }, [username, password]);

  /** 确认后的五 Agent 分析流水线：进度条 + 报告逐字输出 + 组件整包 */
  const runAnalysisStream = useCallback(
    async (sessionId: string, onError: (message: string) => void) => {
      const entryId = nextEntryId();
      setEntries((prev) => [
        ...prev,
        {
          id: entryId,
          role: "assistant",
          text: "",
          stream: { stages: ANALYSIS_STAGES, activeIndex: 0, percent: 0 },
        },
      ]);
      try {
        await streamSse(
          "/api/ui-chat/analysis/stream",
          { sessionId },
          {
            onStage: (stage) =>
              patchEntry(entryId, (entry) => ({
                ...entry,
                stream: entry.stream
                  ? { ...entry.stream, activeIndex: stage.index, percent: stage.percent }
                  : entry.stream,
              })),
            onDelta: (text) =>
              patchEntry(entryId, (entry) => ({ ...entry, text: (entry.text ?? "") + text })),
            onComponents: (components) =>
              patchEntry(entryId, (entry) => ({
                ...entry,
                components: [...(entry.components ?? []), ...components],
              })),
            onDone: () =>
              patchEntry(entryId, (entry) => ({
                ...entry,
                stream: entry.stream ? { ...entry.stream, percent: 100 } : entry.stream,
              })),
            onError: onError,
          },
        );
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setToken(null);
        onError(e instanceof Error ? e.message : "请求失败");
      }
    },
    [patchEntry],
  );

  const sendInput = useCallback(async () => {
    const text = input.trim();
    const sessionId = sessionIdRef.current;
    if (!text || !token || loading) return;
    setInput("");
    setEntries((prev) => [...prev, { id: nextEntryId(), role: "user", text }]);
    setLoading(true);
    const entryId = nextEntryId();
    setEntries((prev) => [...prev, { id: entryId, role: "assistant", text: "" }]);
    try {
      await streamSse(
        "/api/ui-chat/chat/stream",
        { sessionId, input: text },
        {
          onDelta: (delta) =>
            patchEntry(entryId, (entry) => ({ ...entry, text: (entry.text ?? "") + delta })),
          onComponents: (components) =>
            patchEntry(entryId, (entry) => ({
              ...entry,
              components: [...(entry.components ?? []), ...components],
            })),
          onError: (message) => patchEntry(entryId, (entry) => ({ ...entry, error: message })),
        },
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setToken(null);
      patchEntry(entryId, (entry) => ({
        ...entry,
        error: e instanceof Error ? e.message : "请求失败",
      }));
    } finally {
      setLoading(false);
    }
  }, [input, token, loading, patchEntry]);

  const handleAction = useCallback(
    async (action: UIAction) => {
      const sessionId = sessionIdRef.current;
      if (!token || loading) return;
      setLoading(true);
      const confirmed = action.componentType === "confirmation" && action.payload.type === "confirm" && action.payload.confirmed;
      try {
        const response = await apiPost<AIUIResponse>("/api/ui-chat/action", {
          sessionId,
          action,
        });
        appendAssistant(response);
        if (confirmed) {
          // 确认后启动五 Agent 分析流，loading 一直保持到流结束
          await runAnalysisStream(sessionId, (message) =>
            setEntries((prev) => [
              ...prev,
              { id: nextEntryId(), role: "assistant", error: message },
            ]),
          );
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) setToken(null);
        setEntries((prev) => [
          ...prev,
          { id: nextEntryId(), role: "assistant", error: e instanceof Error ? e.message : "请求失败" },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [token, loading, appendAssistant, runAnalysisStream],
  );

  if (!token) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-sm flex-col justify-center px-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h1 className="mb-1 text-lg font-semibold text-slate-900">AI 需求分析助手</h1>
          <p className="mb-4 text-xs text-slate-500">登录后开始对话（user-system 账号）</p>
          <div className="flex flex-col gap-3">
            <input
              type="text"
              placeholder="用户名"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              placeholder="密码"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleLogin()}
            />
            {authError && (
              <p role="alert" className="text-xs text-red-600">
                {authError}
              </p>
            )}
            <button
              type="button"
              disabled={authLoading || !username.trim() || !password}
              onClick={() => void handleLogin()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {authLoading ? "登录中…" : "登录"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col px-4">
      <header className="flex items-center justify-between border-b border-slate-200 py-3">
        <h1 className="text-sm font-semibold text-slate-900">AI 需求分析助手</h1>
        <button
          type="button"
          onClick={() => {
            clearToken();
            setEntries([]);
            setToken(null);
          }}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          退出登录
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto py-4">
        {entries.length === 0 && (
          <p className="pt-8 text-center text-sm text-slate-400">
            输入「我要提一个新需求」开始，或先打个招呼
          </p>
        )}
        {entries.map((entry) => (
          <div key={entry.id}>
            {entry.role === "user" ? (
              <div className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2 text-sm text-white">
                  {entry.text}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3">
                {entry.stream && (
                  <StreamProgress
                    stream={entry.stream}
                    hasContent={Boolean(entry.text || entry.components?.length)}
                  />
                )}
                {entry.text && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
                    {entry.text}
                  </p>
                )}
                {entry.components?.map((component, index) => (
                  <div key={index} className="w-full max-w-md">
                    <ComponentRenderer response={component} onAction={handleAction} />
                  </div>
                ))}
                {entry.error && (
                  <p role="alert" className="text-xs text-red-600">
                    {entry.error}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && <p className="text-xs text-slate-400">处理中…</p>}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-slate-200 py-3">
        <input
          type="text"
          placeholder="输入消息…"
          className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:border-blue-500"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void sendInput()}
        />
        <button
          type="button"
          disabled={loading || !input.trim()}
          onClick={() => void sendInput()}
          className="rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          发送
        </button>
      </div>
    </div>
  );
}
