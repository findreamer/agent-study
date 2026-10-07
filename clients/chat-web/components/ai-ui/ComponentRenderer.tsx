"use client";
import type { UIAction, UIResponse } from "@/lib/ui-protocol";
import { SelectionCard } from "./SelectionCard";
import { DynamicForm } from "./DynamicForm";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { InfoCard } from "./InfoCard";
import { StepsProgress } from "./StepsProgress";
import { DataTable } from "./DataTable";
import { ActionButtons } from "./ActionButtons";

interface Props {
  response: UIResponse;
  onAction: (action: UIAction) => void;
}

// 根据 type 字段分发渲染；text 无独立交互，直接内联渲染
export function ComponentRenderer({ response, onAction }: Props) {
  switch (response.type) {
    case "text":
      return (
        <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
          {response.content}
        </p>
      );
    case "selection":
      return <SelectionCard response={response} onAction={onAction} />;
    case "form":
      return <DynamicForm response={response} onAction={onAction} />;
    case "confirmation":
      return <ConfirmationDialog response={response} onAction={onAction} />;
    case "card":
      return <InfoCard response={response} onAction={onAction} />;
    case "steps":
      return <StepsProgress response={response} />;
    case "table":
      return <DataTable response={response} onAction={onAction} />;
    case "action_buttons":
      return <ActionButtons response={response} onAction={onAction} />;
    default:
      return null;
  }
}
