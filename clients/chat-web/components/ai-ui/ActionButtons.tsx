"use client";
import type { ActionButtonsResponse, UIAction } from "@/lib/ui-protocol";

interface Props {
  response: ActionButtonsResponse;
  onAction: (action: UIAction) => void;
}

const buttonClass: Record<string, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  default: "border border-slate-300 text-slate-700 hover:bg-slate-50",
};

export function ActionButtons({ response, onAction }: Props) {
  return (
    <div
      className={`flex gap-2 ${response.layout === "vertical" ? "flex-col items-stretch" : "flex-wrap"}`}
    >
      {response.buttons.map((button) => (
        <button
          key={button.id}
          type="button"
          onClick={() =>
            onAction({
              componentType: "action_buttons",
              payload: { type: "click", actionId: button.id },
            })
          }
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${buttonClass[button.style ?? "default"]}`}
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
