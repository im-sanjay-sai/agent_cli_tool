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

// Shared tool definition used by both streaming and non-streaming runners
const toolDefinition = {
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
};

function formatMessages(userMessages: ChatMessage[]) {
  return userMessages.map((m) => ({
    role: m.role as any,
    content: m.role === 'assistant' && m.tool_calls?.length ? null : (m.content ?? ''),
    ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {}),
    ...(m.name ? { name: m.name } : {}),
    ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
  }));
}

export async function runAgent(
  userMessages: ChatMessage[]
): Promise<ChatResponse> {
  const collectedMessages: ChatMessage[] = [];

  const formattedMessages = formatMessages(userMessages);

  const runner = client.chat.completions
    .runTools({
      model: MODEL,
      messages: [
        { role: 'developer', content: SYSTEM_PROMPT },
        ...formattedMessages,
      ],
      tools: [toolDefinition],
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

export type SSEEmitter = (event: string, data: any) => void;

export async function runAgentStreaming(
  userMessages: ChatMessage[],
  emit: SSEEmitter,
  signal?: AbortSignal,
): Promise<void> {
  const formattedMessages = formatMessages(userMessages);

  const runner = client.chat.completions
    .runTools({
      model: MODEL,
      stream: true,
      messages: [
        { role: 'developer', content: SYSTEM_PROMPT },
        ...formattedMessages,
      ],
      tools: [toolDefinition],
    })
    .on('message', (message: any) => {
      emit('message', message);
    })
    .on('content', (_delta: string, snapshot: string) => {
      emit('content_delta', { delta: _delta, snapshot });
    })
    .on('error', (err: Error) => {
      console.error('[agent] Runner error:', err.message);
      emit('error', { message: err.message });
    });

  // Abort the runner if the client disconnects
  if (signal) {
    signal.addEventListener('abort', () => {
      runner.abort();
    }, { once: true });
  }

  await runner.finalContent();
  emit('done', {});
}
