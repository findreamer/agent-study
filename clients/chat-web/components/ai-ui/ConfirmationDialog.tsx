"use client";
import type { ConfirmationResponse, UIAction } from "@/lib/ui-protocol";

interface Props {
  response: ConfirmationResponse;
  onAction: (action: UIAction) => void;
}

export function ConfirmationDialog({ response, onAction }: Props) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="mb-3 text-sm font-medium text-slate-800">{response.title}</p>
      <ul className="mb-3 flex flex-col gap-1 text-sm text-slate-700">
        {response.summary.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-slate-400">·</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {response.warning && (
        <p className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-800">
          ⚠️ {response.warning}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() =>
            onAction({ componentType: "confirmation", payload: { type: "confirm", confirmed: true } })
          }
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          {response.confirmLabel ?? "确认"}
        </button>
        <button
          type="button"
          onClick={() =>
            onAction({ componentType: "confirmation", payload: { type: "confirm", confirmed: false } })
          }
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-white"
        >
          {response.cancelLabel ?? "取消"}
        </button>
      </div>
    </div>
  );
}
