"use client";
import type { StepsResponse } from "@/lib/ui-protocol";

interface Props {
  response: StepsResponse;
}

export function StepsProgress({ response }: Props) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <ol className="flex flex-col gap-0 sm:flex-row sm:items-start">
        {response.steps.map((step, index) => {
          const done = index < response.currentStep;
          const active = index === response.currentStep;
          return (
            <li key={step.label} className="flex flex-1 items-start gap-2 sm:flex-col sm:items-center">
              <div className="flex items-center sm:w-full">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    done
                      ? "bg-blue-600 text-white"
                      : active
                        ? "border-2 border-blue-600 text-blue-600"
                        : "border-2 border-slate-200 text-slate-400"
                  }`}
                >
                  {done ? "✓" : index + 1}
                </span>
                {index < response.steps.length - 1 && (
                  <span
                    className={`mx-2 h-0.5 flex-1 sm:mx-0 sm:mt-0 sm:h-0.5 ${
                      done ? "bg-blue-600" : "bg-slate-200"
                    } sm:block sm:w-full`}
                  />
                )}
              </div>
              <div className="pb-2 sm:text-center">
                <p
                  className={`text-xs font-medium ${
                    done || active ? "text-slate-800" : "text-slate-400"
                  }`}
                >
                  {step.label}
                </p>
                {step.description && (
                  <p className="hidden text-xs text-slate-400 sm:block">{step.description}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
