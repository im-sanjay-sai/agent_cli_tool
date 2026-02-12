"use client";

import { useState } from "react";

interface ToolCallProps {
  name: string;
  command: string;
  result: string;
  success: boolean;
}

export function ToolCall({ name, command, result, success }: ToolCallProps) {
  const [expanded, setExpanded] = useState(false);

  // Try to format the result as pretty JSON
  let formattedResult = result;
  try {
    const parsed = JSON.parse(result);
    formattedResult = JSON.stringify(parsed, null, 2);
  } catch {
    // Keep raw string
  }

  // Truncate result for display
  const truncated =
    formattedResult.length > 500 && !expanded
      ? formattedResult.slice(0, 500) + "\n..."
      : formattedResult;

  return (
    <div className="my-2 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden text-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 transition-colors text-left"
      >
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            success ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <code className="text-xs text-gray-600 font-mono truncate flex-1">
          $ {command}
        </code>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 bg-gray-900 text-gray-100 p-3 overflow-x-auto">
          <pre className="text-xs font-mono whitespace-pre-wrap break-words">
            {truncated}
          </pre>
          {formattedResult.length > 500 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300"
            >
              {formattedResult.length > 500 && truncated.endsWith("...")
                ? "Show full output"
                : "Collapse"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
