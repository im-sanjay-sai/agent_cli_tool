import { NextRequest } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { tools } from "@/lib/tools";
import { executeTool } from "@/lib/executor";
import { SYSTEM_PROMPT } from "@/lib/system-prompt";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1";
const MAX_TOOL_ROUNDS = 15;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const userMessages: ChatCompletionMessageParam[] = body.messages || [];

    // Build the full message history with system prompt
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...userMessages,
    ];

    // Tool-calling loop: keep calling GPT until it returns a final text response
    const toolCalls: Array<{
      id: string;
      name: string;
      arguments: string;
      result: string;
      command: string;
      success: boolean;
    }> = [];

    let rounds = 0;

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      const response = await openai.chat.completions.create({
        model: MODEL,
        messages,
        tools,
        tool_choice: "auto",
      });

      const choice = response.choices[0];
      if (!choice) break;

      const assistantMessage = choice.message;
      messages.push(assistantMessage);

      // If no tool calls, we have a final response
      if (
        !assistantMessage.tool_calls ||
        assistantMessage.tool_calls.length === 0
      ) {
        return Response.json({
          message: assistantMessage.content || "",
          toolCalls,
        });
      }

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown> = {};

        try {
          toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          toolArgs = {};
        }

        console.log(`[agent] Executing tool: ${toolName}`, toolArgs);

        const result = await executeTool(toolName, toolArgs);

        console.log(
          `[agent] Tool result: ${result.success ? "success" : "error"} (${result.command})`
        );

        // Track tool calls for the UI
        toolCalls.push({
          id: toolCall.id,
          name: toolName,
          arguments: toolCall.function.arguments,
          result: result.output,
          command: result.command,
          success: result.success,
        });

        // Feed the result back to GPT
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.output,
        });
      }
    }

    // If we hit the max rounds, return what we have
    return Response.json({
      message:
        "I reached the maximum number of tool calls. Here's what I've done so far.",
      toolCalls,
    });
  } catch (error) {
    console.error("[agent] Error:", error);
    return Response.json(
      {
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        toolCalls: [],
      },
      { status: 500 }
    );
  }
}
