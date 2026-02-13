import OpenAI from 'openai';
import { SYSTEM_PROMPT } from './systemPrompt';
import { executeCli } from './executeCli';

const client = new OpenAI();

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.2';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'developer' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
}

export interface ChatResponse {
  messages: ChatMessage[];
  finalContent: string;
}

export async function runAgent(
  userMessages: ChatMessage[]
): Promise<ChatResponse> {
  const collectedMessages: ChatMessage[] = [];

  // Build messages array, preserving content:null for assistant tool-call messages
  const formattedMessages = userMessages.map((m) => ({
    role: m.role as any,
    // Preserve null content for assistant messages with tool_calls (OpenAI API requires it)
    content: m.role === 'assistant' && m.tool_calls?.length ? null : (m.content ?? ''),
    ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    ...(m.name ? { name: m.name } : {}),
    ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
  }));

  const runner = client.chat.completions
    .runTools({
      model: MODEL,
      messages: [
        { role: 'developer', content: SYSTEM_PROMPT },
        ...formattedMessages,
      ],
      tools: [
        {
          type: 'function' as const,
          function: {
            function: executeCli,
            parse: JSON.parse,
            name: 'execute_cli_command',
            description:
              'Execute a Quill CLI command. The command must start with "quill". Returns JSON output from the CLI.',
            parameters: {
              type: 'object' as const,
              properties: {
                command: {
                  type: 'string',
                  description:
                    'The full quill CLI command to execute, e.g. "quill dashboard list --pretty"',
                },
              },
              required: ['command'],
            },
          },
        },
      ],
    })
    .on('message', (message: any) => {
      collectedMessages.push(message);
    })
    .on('error', (err: Error) => {
      console.error('[agent] Runner error:', err.message);
    });

  const finalContent = (await runner.finalContent()) || '';

  return {
    messages: collectedMessages,
    finalContent,
  };
}
