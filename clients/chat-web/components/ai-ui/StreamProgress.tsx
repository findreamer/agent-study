"use client";

export interface StreamStageState {
  stages: string[];
  activeIndex: number;
  percent: number;
}

interface Props {
  stream: StreamStageState;
  hasContent: boolean;
}

/** 五 Agent 流水线的实时进度：进度条 + 阶段 chips + 无内容时的脉冲兜底 */
export function StreamProgress({ stream, hasContent }: Props) {
  const activeLabel = stream.stages[stream.activeIndex] ?? "准备中";
  return (
    <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">{activeLabel}中…</span>
        <span className="font-mono text-blue-600">{stream.percent}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-500"
          style={{ width: `${stream.percent}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {stream.stages.map((label, index) => (
          <span
            key={label}
            className={`rounded-full px-2.5 py-1 text-xs ${
              index < stream.activeIndex
                ? "bg-blue-50 text-blue-600"
                : index === stream.activeIndex
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-400"
            }`}
          >
            {index < stream.activeIndex ? "✓ " : ""}
            {label}
          </span>
        ))}
      </div>
      {!hasContent && (
        <div className="mt-3 space-y-2" aria-hidden>
          {[90, 75, 60].map((width) => (
            <div key={width} className="shimmer h-3 rounded bg-slate-100" style={{ width: `${width}%` }} />
          ))}
        </div>
      )}
    </div>
  );
}
