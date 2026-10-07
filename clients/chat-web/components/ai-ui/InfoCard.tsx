"use client";
import type { CardResponse, UIAction } from "@/lib/ui-protocol";

interface Props {
  response: CardResponse;
  onAction: (action: UIAction) => void;
}

export function InfoCard({ response, onAction }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-800">
        {response.title}
      </p>
      <dl className="flex flex-col gap-1.5 text-sm">
        {response.fields.map((field) => (
          <div key={field.label} className="flex gap-2">
            <dt className="w-24 shrink-0 text-slate-500">{field.label}</dt>
            <dd className="text-slate-800">{field.value}</dd>
          </div>
        ))}
      </dl>
      {response.actions?.length ? (
        <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
          {response.actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() =>
                onAction({ componentType: "card", payload: { type: "click", actionId: action.id } })
              }
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
