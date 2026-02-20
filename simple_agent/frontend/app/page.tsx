"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { InView } from "@/components/motion-primitives/in-view";
import { TextEffect } from "@/components/motion-primitives/text-effect";
import { TextShimmer } from "@/components/motion-primitives/text-shimmer";
import {
  Disclosure,
  DisclosureTrigger,
  DisclosureContent,
} from "@/components/motion-primitives/disclosure";
import { MessageSquare, Plus, Terminal, ChevronDown, PanelLeftClose, PanelLeft, Send, Copy, Check } from "lucide-react";

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

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

// ---------- Storage ----------

function loadConversations(): Conversation[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("quill-conversations") || "[]");
  } catch { return []; }
}

function saveConversations(convs: Conversation[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem("quill-conversations", JSON.stringify(convs));
}

// ---------- Components ----------

function ToolCallBlock({ toolCall, result }: { toolCall: ToolCall; result?: Message }) {
  const [open, setOpen] = useState(false);
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(toolCall.function.arguments); } catch {}

  const resultContent = result?.content || "";
  let parsedResult: Record<string, unknown> | null = null;
  try { parsedResult = JSON.parse(resultContent); } catch {}

  const isError = parsedResult && "ok" in parsedResult && parsedResult.ok === false;
  const formatted = parsedResult ? JSON.stringify(parsedResult, null, 2) : resultContent;
  const shouldTruncate = formatted.length > 600;
  const display = shouldTruncate && !open ? formatted.slice(0, 600) + "\n..." : formatted;

  return (
    <div className="my-1.5 rounded-lg border border-[var(--tool-border)] bg-[var(--tool-bg)] overflow-hidden">
      <Disclosure open={open} onOpenChange={setOpen}
        transition={{ duration: 0.2, ease: "easeOut" }}>
        <DisclosureTrigger>
          <div className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--surface-hover)] transition-colors text-left cursor-pointer group">
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
              <ChevronDown className={`w-3.5 h-3.5 text-[var(--muted)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            )}
          </div>
        </DisclosureTrigger>
        <DisclosureContent>
          {result && (
            <div className="border-t border-[var(--tool-border)] bg-[#0d1117] p-3 overflow-x-auto max-h-72 overflow-y-auto">
              <pre className="text-[11px] font-mono text-gray-400 whitespace-pre-wrap break-words leading-relaxed">
                {display}
              </pre>
              {shouldTruncate && (
                <button onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
                  className="mt-2 text-[11px] text-blue-400 hover:text-blue-300 hover:underline">
                  {display.endsWith("...") ? "Show full output" : "Collapse"}
                </button>
              )}
            </div>
          )}
        </DisclosureContent>
      </Disclosure>
    </div>
  );
}

function LoadingIndicator() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Terminal className="w-3.5 h-3.5 text-[var(--accent)] animate-pulse" />
      <TextShimmer className="text-xs [--base-color:#71717a] [--base-gradient-color:#e5e5e5]" duration={1.5}>
        Running commands...
      </TextShimmer>
    </div>
  );
}

function CodeBlock({ children, className, ...props }: React.ComponentPropsWithoutRef<"code"> & { children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const isInline = !className && typeof children === "string" && !children.includes("\n");

  if (isInline) {
    return <code className={className} {...props}>{children}</code>;
  }

  const text = String(children).replace(/\n$/, "");

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-[var(--surface-hover)] opacity-0 group-hover:opacity-100 transition-opacity text-[var(--muted)] hover:text-[var(--foreground)]"
        aria-label="Copy code"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
      <code className={className} {...props}>{children}</code>
    </div>
  );
}

const markdownComponents = {
  code: CodeBlock,
};

const MarkdownContent = React.memo(function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  );
});

function friendlyError(err: unknown): string {
  if (err instanceof TypeError && (err as Error).message === "Failed to fetch")
    return "Could not reach the backend server. Make sure it is running.";
  if (err instanceof DOMException && err.name === "AbortError")
    return "Request was cancelled.";
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

// ---------- SSE Parser ----------

interface SSEEvent {
  event: string;
  data: string;
}

function parseSSEBlocks(raw: string): { events: SSEEvent[]; remainder: string } {
  const events: SSEEvent[] = [];
  const parts = raw.split("\n\n");
  const remainder = parts.pop() || "";
  for (const block of parts) {
    if (!block.trim()) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
    }
    if (dataLines.length > 0) {
      events.push({ event, data: dataLines.join("\n") });
    }
  }
  return { events, remainder };
}

const SUGGESTIONS = [
  { label: "List dashboards", text: "List all my dashboards" },
  { label: "Show reports", text: "Show reports in the transactions dashboard" },
  { label: "Explore schema", text: "Show me the database tables" },
  { label: "Virtual tables", text: "List all virtual tables" },
  { label: "Check status", text: "Check my connection status" },
  { label: "AI query", text: "Generate SQL to show total transactions by month" },
];

// ---------- Sidebar ----------

function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  collapsed,
  onToggle,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (collapsed) {
    return (
      <div className="w-12 border-r border-[var(--border)] bg-[var(--background)] flex flex-col items-center py-3 gap-2">
        <button onClick={onToggle} className="p-2 rounded-lg hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
          <PanelLeft className="w-4 h-4" />
        </button>
        <button onClick={onNew} className="p-2 rounded-lg hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-60 border-r border-[var(--border)] bg-[var(--background)] flex flex-col">
      <div className="p-3 flex items-center justify-between">
        <button onClick={onNew}
          className="flex items-center gap-2 text-xs text-[var(--foreground)] hover:bg-[var(--surface)] px-3 py-2 rounded-lg transition-colors flex-1">
          <Plus className="w-3.5 h-3.5" /> New chat
        </button>
        <button onClick={onToggle} className="p-2 rounded-lg hover:bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
          <PanelLeftClose className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 ? (
          <p className="text-[11px] text-[var(--muted)] px-3 py-4">No conversations yet</p>
        ) : (
          conversations.map((c) => (
            <button key={c.id} onClick={() => onSelect(c.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate mb-0.5 transition-colors ${
                activeId === c.id
                  ? "bg-[var(--surface)] text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
              }`}>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{c.title}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// ---------- Main ----------

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load conversations from localStorage on mount
  useEffect(() => {
    setConversations(loadConversations());
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + "px";
    }
  }, [input]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // Save conversation after messages change
  useEffect(() => {
    if (!activeId || messages.length === 0) return;
    const updated = conversations.map((c) =>
      c.id === activeId ? { ...c, messages, updatedAt: Date.now() } : c
    );
    setConversations(updated);
    saveConversations(updated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  function handleNewChat() {
    setActiveId(null);
    setMessages([]);
    setInput("");
    inputRef.current?.focus();
  }

  function handleSelectConversation(id: string) {
    const conv = conversations.find((c) => c.id === id);
    if (conv) {
      setActiveId(id);
      setMessages(conv.messages);
    }
  }

  const handleSubmit = useCallback(async (overrideText?: string) => {
    const trimmed = (overrideText || input).trim();
    if (!trimmed || isLoading) return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    const userMsg: Message = { role: "user", content: trimmed };
    const baseMessages = [...messages, userMsg];
    setMessages(baseMessages);
    setInput("");
    setIsLoading(true);

    // Create or update conversation
    let convId = activeId;
    if (!convId) {
      convId = crypto.randomUUID();
      const newConv: Conversation = {
        id: convId,
        title: trimmed.slice(0, 40),
        messages: baseMessages,
        updatedAt: Date.now(),
      };
      const newConvs = [newConv, ...conversations];
      setConversations(newConvs);
      saveConversations(newConvs);
      setActiveId(convId);
    }

    // Mutable accumulator for streamed messages (avoids stale closures)
    const newMessages: Message[] = [];
    let hasStreamingMsg = false;

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: baseMessages,
          sessionId: convId,
        }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, remainder } = parseSSEBlocks(buffer);
        buffer = remainder;

        for (const sse of events) {
          if (sse.event === "message") {
            const msg = JSON.parse(sse.data) as Message;
            if (msg.role === "assistant" && msg.content && hasStreamingMsg) {
              newMessages[newMessages.length - 1] = msg;
              hasStreamingMsg = false;
            } else {
              newMessages.push(msg);
            }
            setMessages([...baseMessages, ...newMessages]);
          } else if (sse.event === "content_delta") {
            const { snapshot } = JSON.parse(sse.data) as { delta: string; snapshot: string };
            if (hasStreamingMsg) {
              newMessages[newMessages.length - 1] = { role: "assistant", content: snapshot };
            } else {
              newMessages.push({ role: "assistant", content: snapshot });
              hasStreamingMsg = true;
            }
            setMessages([...baseMessages, ...newMessages]);
          } else if (sse.event === "error") {
            const { message: errMsg } = JSON.parse(sse.data);
            newMessages.push({ role: "assistant", content: `**Error:** ${errMsg}` });
            setMessages([...baseMessages, ...newMessages]);
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      newMessages.push({ role: "assistant", content: `**Error:** ${friendlyError(err)}` });
      setMessages([...baseMessages, ...newMessages]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, activeId, conversations]);

  function renderMessages() {
    const els: React.ReactNode[] = [];
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === "user") {
        els.push(
          <InView key={i} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.2 }} once>
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-[var(--accent)] text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm shadow-sm">
                {msg.content}
              </div>
            </div>
          </InView>
        );
      } else if (msg.role === "assistant" && msg.tool_calls?.length) {
        const count = msg.tool_calls.length;
        els.push(
          <InView key={`${i}-label`} variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={{ duration: 0.15 }} once>
            <div className="text-[11px] text-[var(--muted)] mt-3 mb-1 flex items-center gap-1.5">
              <Terminal className="w-3 h-3" />
              {count} command{count > 1 ? "s" : ""} executed
            </div>
          </InView>
        );
        msg.tool_calls.forEach((tc) => {
          const result = messages.find((m) => m.role === "tool" && m.tool_call_id === tc.id);
          els.push(
            <InView key={`${i}-tc-${tc.id}`} variants={{ hidden: { opacity: 0, x: -8 }, visible: { opacity: 1, x: 0 } }}
              transition={{ duration: 0.2 }} once>
              <div className="max-w-[92%]">
                <ToolCallBlock toolCall={tc} result={result} />
              </div>
            </InView>
          );
        });
      } else if (msg.role === "assistant" && msg.content) {
        els.push(
          <InView key={i} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
            transition={{ duration: 0.25 }} once>
            <div className="max-w-[85%]">
              <div className="bg-[var(--surface)] rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <div className="prose prose-invert prose-sm max-w-none
                  prose-p:my-1.5 prose-p:leading-relaxed
                  prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5
                  prose-headings:my-2 prose-headings:text-[var(--foreground)]
                  prose-pre:my-2 prose-pre:bg-[#0d1117] prose-pre:text-gray-300 prose-pre:text-xs
                  prose-code:text-blue-300 prose-code:bg-[#1a1f2e] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                  prose-a:text-blue-400 prose-strong:text-[var(--foreground)]">
                  <MarkdownContent content={msg.content} />
                </div>
              </div>
            </div>
          </InView>
        );
      }
    }
    return els;
  }

  return (
    <div className="flex h-screen max-h-screen bg-[var(--background)]">
      {/* Sidebar */}
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)]">
          <div className="w-7 h-7 rounded-md bg-[var(--accent)] flex items-center justify-center text-white font-bold text-xs">Q</div>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-[var(--foreground)]">Quill CLI Agent</h1>
            <p className="text-[11px] text-[var(--muted)]">Manage dashboards, reports & schemas via chat</p>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-14 h-14 rounded-xl bg-[var(--surface)] flex items-center justify-center mb-4">
                <span className="text-xl text-[var(--accent)] font-bold">Q</span>
              </div>
              <TextEffect per="word" preset="fade" className="text-base font-semibold mb-1.5">
                Quill CLI Agent
              </TextEffect>
              <TextEffect per="word" preset="fade" delay={0.3}
                className="text-sm text-[var(--muted)] max-w-sm mb-8">
                Manage your BI dashboards, reports, virtual tables, and schemas.
              </TextEffect>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-xl w-full">
                {SUGGESTIONS.map((s, idx) => (
                  <InView key={s.label}
                    variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
                    transition={{ duration: 0.25, delay: 0.4 + idx * 0.05 }} once>
                    <button onClick={() => handleSubmit(s.text)}
                      className="text-left text-xs px-3 py-2.5 rounded-lg border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface)] hover:scale-[1.02] active:scale-[0.98] transition-all">
                      {s.label}
                    </button>
                  </InView>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-3">
              {renderMessages()}
              {isLoading && (
                <InView variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
                  transition={{ duration: 0.2 }} once>
                  <div className="max-w-[85%]">
                    <div className="bg-[var(--surface)] rounded-2xl rounded-bl-sm">
                      <LoadingIndicator />
                    </div>
                  </div>
                </InView>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-[var(--border)] px-5 py-3">
          <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="max-w-3xl mx-auto flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                placeholder="Ask about dashboards, reports, schema..." rows={1}
                className="w-full resize-none bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)]/60 transition-colors" />
            </div>
            <button type="submit" disabled={isLoading || !input.trim()}
              className="flex-shrink-0 w-9 h-9 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all hover:scale-105 active:scale-95">
              <Send className="w-4 h-4 text-white" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
