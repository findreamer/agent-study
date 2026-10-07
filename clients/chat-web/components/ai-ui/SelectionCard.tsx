"use client";
import { useState } from "react";
import type { SelectionResponse, UIAction } from "@/lib/ui-protocol";

interface Props {
  response: SelectionResponse;
  onAction: (action: UIAction) => void;
}

export function SelectionCard({ response, onAction }: Props) {
  const [multi, setMulti] = useState<string[]>([]);

  function selectSingle(id: string) {
    onAction({ componentType: "selection", payload: { type: "select", selectedId: id } });
  }

  function submitMultiple() {
    if (!multi.length) return;
    onAction({ componentType: "selection", payload: { type: "select", selectedId: multi } });
  }

  if (response.allowMultiple) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-sm font-medium text-slate-800">{response.title}</p>
        <div className="flex flex-col gap-2">
          {response.options.map((option) => (
            <label
              key={option.id}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={multi.includes(option.id)}
                onChange={(e) =>
                  setMulti((prev) =>
                    e.target.checked ? [...prev, option.id] : prev.filter((id) => id !== option.id),
                  )
                }
              />
              <span>
                <span className="font-medium text-slate-800">
                  {option.icon ? `${option.icon} ` : ""}
                  {option.label}
                </span>
                {option.description && (
                  <span className="block text-xs text-slate-500">{option.description}</span>
                )}
              </span>
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={!multi.length}
          onClick={submitMultiple}
          className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          确定（已选 {multi.length} 项）
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm font-medium text-slate-800">{response.title}</p>
      <div className="flex flex-col gap-2">
        {response.options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => selectSingle(option.id)}
            className="rounded-lg border border-slate-200 p-3 text-left text-sm transition hover:border-blue-400 hover:bg-blue-50"
          >
            <span className="font-medium text-slate-800">
              {option.icon ? `${option.icon} ` : ""}
              {option.label}
            </span>
            {option.description && (
              <span className="block text-xs text-slate-500">{option.description}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
