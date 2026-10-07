"use client";
import { useState } from "react";
import type { FormResponse, UIAction } from "@/lib/ui-protocol";

interface Props {
  response: FormResponse;
  onAction: (action: UIAction) => void;
}

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500";

export function DynamicForm({ response, onAction }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      response.fields
        .filter((field) => field.defaultValue !== undefined)
        .map((field) => [field.name, field.defaultValue as string]),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  function setValue(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function submit() {
    const missing = response.fields
      .filter((field) => field.required && !values[field.name]?.trim())
      .map((field) => field.label);
    if (missing.length) {
      setError(`请填写：${missing.join("、")}`);
      return;
    }
    setError(null);
    onAction({ componentType: "form", payload: { type: "submit", formData: values } });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="mb-3 text-sm font-medium text-slate-800">{response.title}</p>
      <div className="flex flex-col gap-3">
        {response.fields.map((field) => (
          <label key={field.name} className="block">
            <span className="mb-1 block text-xs text-slate-600">
              {field.label}
              {field.required && <span className="ml-0.5 text-red-500">*</span>}
            </span>
            {field.type === "textarea" ? (
              <textarea
                rows={3}
                className={inputClass}
                placeholder={field.placeholder}
                value={values[field.name] ?? ""}
                onChange={(e) => setValue(field.name, e.target.value)}
              />
            ) : field.type === "select" ? (
              <select
                className={inputClass}
                value={values[field.name] ?? ""}
                onChange={(e) => setValue(field.name, e.target.value)}
              >
                <option value="">请选择</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === "input" ? "text" : field.type}
                className={inputClass}
                placeholder={field.placeholder}
                value={values[field.name] ?? ""}
                onChange={(e) => setValue(field.name, e.target.value)}
              />
            )}
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        {response.submitLabel ?? "提交"}
      </button>
    </div>
  );
}
