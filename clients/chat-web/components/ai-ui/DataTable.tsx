"use client";
import type { TableResponse, UIAction } from "@/lib/ui-protocol";

interface Props {
  response: TableResponse;
  onAction: (action: UIAction) => void;
}

export function DataTable({ response, onAction }: Props) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left">
            {response.columns.map((column) => (
              <th key={column.key} className="px-4 py-2.5 text-xs font-semibold text-slate-600">
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {response.rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              onClick={
                response.selectable
                  ? () =>
                      onAction({
                        componentType: "table",
                        payload: { type: "row_select", rowIndex },
                      })
                  : undefined
              }
              className={`border-b border-slate-100 last:border-0 ${
                response.selectable ? "cursor-pointer hover:bg-blue-50" : ""
              }`}
            >
              {response.columns.map((column) => (
                <td key={column.key} className="px-4 py-2.5 text-slate-700">
                  {row[column.key] === null ? "-" : String(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
