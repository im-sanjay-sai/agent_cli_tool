"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ---------- Types ----------

interface Message {
  role: "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

// ---------- Components ----------

function ToolCallBlock({ toolCall, result }: { toolCall: ToolCall; result?: Message }) {
  const [showFull, setShowFull] = useState(false);
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(toolCall.function.arguments); } catch {}

  const resultContent = result?.content || "";
  let parsedResult: Record<string, unknown> | null = null;
  try { parsedResult = JSON.parse(resultContent); } catch {}

  const isError = parsedResult && "ok" in parsedResult && parsedResult.ok === false;
  const formatted = parsedResult ? JSON.stringify(parsedResult, null, 2) : resultContent;
  const shouldTruncate = formatted.length > 600;
  const display = shouldTruncate && !showFull ? formatted.slice(0, 600) + "\n..." : formatted;

  return (
    <div className="my-1.5 rounded-lg border border-[var(--tool-border)] bg-[var(--tool-bg)] overflow-hidden">
      <button
        onClick={() => result && setShowFull(!showFull)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--surface-hover)] transition-colors text-left group"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
          !result ? "bg-yellow-500 animate-pulse" : isError ? "bg-red-500" : "bg-green-500"
        }`} />
        <code className="text-xs font-mono text-[var(--foreground)] truncate flex-1 opacity-80 group-hover:opacity-100">
          {(args.command as string) || toolCall.function.name}
        </code>
        {result && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            isError ? "bg-red-900/40 text-red-400" : "bg-green-900/40 text-green-400"
          }`}>
            {isError ? "error" : "done"}
          </span>
        )}
        {result && (
          <svg className={`w-3.5 h-3.5 text-[var(--muted)] flex-shrink-0 transition-transform ${showFull ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>
      {showFull && result && (
        <div className="border-t border-[var(--tool-border)] bg-[#0d1117] p-3 overflow-x-auto max-h-72 overflow-y-auto">
          <pre className="text-[11px] font-mono text-gray-400 whitespace-pre-wrap break-words leading-relaxed">
            {display}
          </pre>
          {shouldTruncate && (
            <button onClick={() => setShowFull(!showFull)}
              className="mt-2 text-[11px] text-blue-400 hover:text-blue-300 hover:underline">
              {display.endsWith("...") ? "Show full output" : "Collapse"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex items-center gap-1">
        <div className="typing-dot w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
        <div className="typing-dot w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
        <div className="typing-dot w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
      </div>
      <span className="text-xs text-[var(--muted)]">Running commands...</span>
    </div>
  );
}

function friendlyError(err: unknown): string {
  if (err instanceof TypeError && (err as Error).message === "Failed to fetch")
    return "Could not reach the backend server. Make sure it is running.";
  if (err instanceof DOMException && err.name === "AbortError")
    return "Request was cancelled.";
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

const SUGGESTIONS = [
  { label: "List dashboards", text: "List all my dashboards" },
  { label: "Show reports", text: "Show reports in the transactions dashboard" },
  { label: "Explore schema", text: "Show me the database tables" },
  { label: "Virtual tables", text: "List all virtual tables" },
  { label: "Check status", text: "Check my connection status" },
  { label: "AI query", text: "Generate SQL to show total transactions by month" },
];

// ---------- Main ----------

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + "px";
    }
  }, [input]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const handleSubmit = useCallback(async (overrideText?: string) => {
    const trimmed = (overrideText || input).trim();
    if (!trimmed || isLoading) return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    const userMsg: Message = { role: "user", content: trimmed };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setIsLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated }),
        signal: abort.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setMessages([...updated, ...data.messages]);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessages([...updated, { role: "assistant", content: `**Error:** ${friendlyError(err)}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages]);

  function handleNewChat() {
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  function renderMessages() {
    const els: React.ReactNode[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === "user") {
        els.push(
          <div key={i} className="flex justify-end">
            <div className="max-w-[80%] bg-[var(--accent)] text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm shadow-sm">
              {msg.content}
            </div>
          </div>
        );
      } else if (msg.role === "assistant" && msg.tool_calls?.length) {
        const count = msg.tool_calls.length;
        els.push(
          <div key={`${i}-label`} className="text-[11px] text-[var(--muted)] mt-3 mb-1 flex items-center gap-1.5">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            {count} command{count > 1 ? "s" : ""} executed
          </div>
        );
        msg.tool_calls.forEach((tc) => {
          const result = messages.find((m) => m.role === "tool" && m.tool_call_id === tc.id);
          els.push(
            <div key={`${i}-tc-${tc.id}`} className="max-w-[92%]">
              <ToolCallBlock toolCall={tc} result={result} />
            </div>
          );
        });
      } else if (msg.role === "assistant" && msg.content) {
        els.push(
          <div key={i} className="max-w-[85%]">
            <div className="bg-[var(--surface)] rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="prose prose-invert prose-sm max-w-none
                prose-p:my-1.5 prose-p:leading-relaxed
                prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5
                prose-headings:my-2 prose-headings:text-[var(--foreground)]
                prose-pre:my-2 prose-pre:bg-[#0d1117] prose-pre:text-gray-300 prose-pre:text-xs
                prose-code:text-blue-300 prose-code:bg-[#1a1f2e] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                prose-a:text-blue-400 prose-strong:text-[var(--foreground)]
                prose-table:text-xs prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        );
      }
    }
    return els;
  }

  return (
    <div className="flex flex-col h-screen max-h-screen bg-[var(--background)]">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)]">
        <div className="w-7 h-7 rounded-md bg-[var(--accent)] flex items-center justify-center text-white font-bold text-xs">Q</div>
        <div className="flex-1">
          <h1 className="text-sm font-semibold text-[var(--foreground)]">Quill CLI Agent</h1>
          <p className="text-[11px] text-[var(--muted)]">Manage dashboards, reports & schemas via chat</p>
        </div>
        {messages.length > 0 && (
          <button onClick={handleNewChat}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface)] transition-all">
            New chat
          </button>
        )}
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-14 h-14 rounded-xl bg-[var(--surface)] flex items-center justify-center mb-4">
              <span className="text-xl text-[var(--accent)] font-bold">Q</span>
            </div>
            <h2 className="text-base font-semibold mb-1.5">Quill CLI Agent</h2>
            <p className="text-sm text-[var(--muted)] max-w-sm mb-8">
              Manage your BI dashboards, reports, virtual tables, and schemas.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-xl w-full">
              {SUGGESTIONS.map((s) => (
                <button key={s.label} onClick={() => handleSubmit(s.text)}
                  className="text-left text-xs px-3 py-2.5 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface)] transition-all">
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-3">
            {renderMessages()}
            {isLoading && (
              <div className="max-w-[85%]">
                <div className="bg-[var(--surface)] rounded-2xl rounded-bl-sm">
                  <LoadingIndicator />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] px-5 py-3">
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="max-w-3xl mx-auto flex items-end gap-2">
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Ask about dashboards, reports, schema..." rows={1}
            className="flex-1 resize-none bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)]/60 transition-colors" />
          <button type="submit" disabled={isLoading || !input.trim()}
            className="flex-shrink-0 w-9 h-9 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
