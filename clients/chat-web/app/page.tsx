"use client";
import { useState } from "react";
import type { RequirementResult } from "@agent-study/contracts";

const DEFAULT_INPUT = "用户注册时必须绑定手机号，密码至少8位";

export default function Home() {
  const [text, setText] = useState(DEFAULT_INPUT);
  const [result, setResult] = useState<RequirementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function extract() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/requirement/extract`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: text }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `请求失败（HTTP ${res.status}）`);
      }
      setResult((await res.json()) as RequirementResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 32 }}>
      <h1>需求结构化抽取</h1>
      <p style={{ color: "#666" }}>
        输入原始需求描述，由 LangChain 结构化抽取为固定字段。
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        style={{
          width: "100%",
          padding: 12,
          fontSize: 15,
          borderRadius: 8,
          border: "1px solid #ccc",
          boxSizing: "border-box",
          fontFamily: "inherit",
        }}
      />
      <button
        onClick={extract}
        disabled={loading || !text.trim()}
        style={{
          marginTop: 12,
          padding: "10px 24px",
          fontSize: 15,
          borderRadius: 8,
          border: "none",
          background: loading || !text.trim() ? "#aaa" : "#1e40af",
          color: "#fff",
          cursor: loading || !text.trim() ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "抽取中…" : "提交抽取"}
      </button>

      {error && (
        <p role="alert" style={{ color: "#dc2626", marginTop: 16 }}>
          {error}
        </p>
      )}

      {result && (
        <section style={{ marginTop: 24 }}>
          <h2>抽取结果</h2>
          <pre
            style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: 16,
              overflowX: "auto",
              fontSize: 14,
            }}
          >
            {JSON.stringify(result, null, 2)}
          </pre>
        </section>
      )}
    </main>
  );
}
