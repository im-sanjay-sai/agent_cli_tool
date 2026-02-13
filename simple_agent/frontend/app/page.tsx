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
  const [expanded, setExpanded] = useState(false);
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(toolCall.function.arguments); } catch {}

  const resultContent = result?.content || "";
  let parsedResult: Record<string, unknown> | null = null;
  try { parsedResult = JSON.parse(resultContent); } catch {}

  const isError = parsedResult && "ok" in parsedResult && parsedResult.ok === false;
  const formatted = parsedResult ? JSON.stringify(parsedResult, null, 2) : resultContent;
  const truncated = formatted.length > 500 && !expanded ? formatted.slice(0, 500) + "\n..." : formatted;

  return (
    <div className="my-2 rounded-lg border border-[var(--tool-border)] bg-[var(--tool-bg)] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--surface-hover)] transition-colors text-left"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
          !result ? "bg-yellow-500 animate-pulse" : isError ? "bg-red-500" : "bg-green-500"
        }`} />
        <code className="text-xs font-mono text-[var(--foreground)] truncate flex-1">
          $ {(args.command as string) || toolCall.function.name}
        </code>
        {result && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            isError ? "bg-red-900/40 text-red-400" : "bg-green-900/40 text-green-400"
          }`}>
            {isError ? "error" : "done"}
          </span>
        )}
        <svg className={`w-4 h-4 text-[var(--muted)] flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && result && (
        <div className="border-t border-[var(--tool-border)] bg-[#0d1117] p-3 overflow-x-auto max-h-80 overflow-y-auto">
          <pre className="text-xs font-mono text-gray-300 whitespace-pre-wrap break-words">
            {truncated}
          </pre>
          {formatted.length > 500 && (
            <button onClick={() => setExpanded(!expanded)}
              className="mt-2 text-xs text-blue-400 hover:text-blue-300">
              {truncated.endsWith("...") ? "Show full output" : "Collapse"}
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
        <div className="typing-dot w-2 h-2 rounded-full bg-[var(--accent)]" />
        <div className="typing-dot w-2 h-2 rounded-full bg-[var(--accent)]" />
        <div className="typing-dot w-2 h-2 rounded-full bg-[var(--accent)]" />
      </div>
      <span className="text-xs text-[var(--muted)]">Thinking and executing commands...</span>
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

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
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
      setMessages([...updated, { role: "assistant", content: `Error: ${friendlyError(err)}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages]);

  function renderMessages() {
    const els: React.ReactNode[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === "user") {
        els.push(
          <div key={i} className="flex justify-end">
            <div className="max-w-[80%] bg-[var(--accent)] text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm">
              {msg.content}
            </div>
          </div>
        );
      } else if (msg.role === "assistant" && msg.tool_calls?.length) {
        // Count tool calls for this assistant message
        const count = msg.tool_calls.length;
        els.push(
          <div key={`${i}-label`} className="text-xs text-[var(--muted)] mt-2 mb-1">
            {count} tool call{count > 1 ? "s" : ""} executed
          </div>
        );
        msg.tool_calls.forEach((tc) => {
          const result = messages.find((m) => m.role === "tool" && m.tool_call_id === tc.id);
          els.push(
            <div key={`${i}-tc-${tc.id}`} className="max-w-[90%]">
              <ToolCallBlock toolCall={tc} result={result} />
            </div>
          );
        });
      } else if (msg.role === "assistant" && msg.content) {
        els.push(
          <div key={i} className="max-w-[85%]">
            <div className="bg-[var(--surface)] rounded-2xl rounded-bl-md px-4 py-3">
              <div className="prose prose-invert prose-sm max-w-none
                prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5
                prose-headings:my-2 prose-pre:my-2 prose-pre:bg-[#0d1117] prose-pre:text-gray-300
                prose-code:text-blue-300 prose-code:bg-[#1a1f2e] prose-code:px-1 prose-code:rounded
                prose-a:text-blue-400 prose-strong:text-[var(--foreground)]">
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
      <header className="flex items-center gap-3 px-6 py-4 border-b border-[var(--border)]">
        <div className="w-8 h-8 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white font-bold text-sm">Q</div>
        <div>
          <h1 className="text-base font-semibold text-[var(--foreground)]">Quill CLI Agent</h1>
          <p className="text-xs text-[var(--muted)]">Manage dashboards, reports, and more via chat</p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--surface)] flex items-center justify-center mb-4">
              <span className="text-2xl text-[var(--accent)]">Q</span>
            </div>
            <h2 className="text-lg font-semibold mb-2">Quill CLI Agent</h2>
            <p className="text-sm text-[var(--muted)] max-w-md mb-8">
              Ask me to manage your Quill BI dashboards, reports, virtual tables, and more.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full">
              {[
                "Check my connection status",
                "Show my database schema",
                "List all dashboards",
                "List virtual tables",
              ].map((s) => (
                <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-left text-sm px-4 py-3 rounded-xl border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)]/50 hover:bg-[var(--surface)] transition-all">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-3">
            {renderMessages()}
            {isLoading && (
              <div className="max-w-[85%]">
                <div className="bg-[var(--surface)] rounded-2xl rounded-bl-md">
                  <LoadingIndicator />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] px-6 py-4">
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="max-w-3xl mx-auto flex items-end gap-3">
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            placeholder="Ask the Quill CLI agent..." rows={1}
            className="flex-1 resize-none bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-colors" />
          <button type="submit" disabled={isLoading || !input.trim()}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
        <p className="text-center text-xs text-[var(--muted)] mt-2">Powered by GPT-5.2 with Quill CLI tool access</p>
      </div>
    </div>
  );
}
