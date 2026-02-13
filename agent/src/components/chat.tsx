"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { ToolCall } from "./tool-call";

interface ToolCallData {
  id: string;
  name: string;
  arguments: string;
  result: string;
  command: string;
  success: boolean;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallData[];
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      // Build the messages payload for the API, including tool call history
      // so the LLM remembers previous tool calls and their results
      const apiMessages: Array<Record<string, unknown>> = [];
      for (const m of newMessages) {
        if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
          // Push assistant message with tool_calls attached (OpenAI format)
          apiMessages.push({
            role: "assistant",
            content: m.content || "",
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function",
              function: {
                name: tc.name,
                arguments: tc.arguments,
              },
            })),
          });
          // Push each tool result as a "tool" role message
          for (const tc of m.toolCalls) {
            apiMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: tc.result,
            });
          }
        } else {
          apiMessages.push({
            role: m.role,
            content: m.content,
          });
        }
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data.message || "No response.",
        toolCalls: data.toolCalls || [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: "assistant",
        content: `Error: ${error instanceof Error ? error.message : "Failed to get response"}`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">Q</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">
              Quill AI Agent
            </h1>
            <p className="text-xs text-gray-500">
              Manage dashboards, reports, and data with natural language
            </p>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mb-4">
              <span className="text-indigo-600 font-bold text-2xl">Q</span>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Welcome to Quill AI Agent
            </h2>
            <p className="text-gray-500 max-w-md mb-6">
              I can help you manage your BI dashboards, explore database schemas,
              create reports, and more. Try one of these:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
              {[
                "Show me all my dashboards",
                "Explore the database schema",
                "Create a sales dashboard with a revenue chart",
                "Generate SQL for monthly revenue by category",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50 text-sm text-gray-700 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div key={index} className="space-y-2">
            <div
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-white border border-gray-200 text-gray-900"
                }`}
              >
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {message.content}
                </div>
              </div>
            </div>

            {/* Tool calls */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="ml-2 space-y-1">
                <p className="text-xs text-gray-400 ml-1">
                  {message.toolCalls.length} tool call
                  {message.toolCalls.length > 1 ? "s" : ""} executed
                </p>
                {message.toolCalls.map((tc) => (
                  <ToolCall
                    key={tc.id}
                    name={tc.name}
                    command={tc.command}
                    result={tc.result}
                    success={tc.success}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span>Thinking and executing commands...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white px-6 py-4">
        <form onSubmit={handleSubmit} className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about your Quill BI setup..."
              rows={1}
              className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-gray-400"
              style={{
                minHeight: "44px",
                maxHeight: "120px",
              }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "auto";
                target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0 rounded-xl bg-indigo-600 text-white px-5 py-3 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Quill AI Agent executes CLI commands on your behalf. Review tool calls
          for transparency.
        </p>
      </div>
    </div>
  );
}
