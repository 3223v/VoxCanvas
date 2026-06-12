// llm/client.ts

import { getLLMClient, getLLMModel } from '@/lib/llm';

interface LLMCallOptions {
  messages: { role: string; content: string }[];
  response_format?: { type: 'json_object' };
  temperature?: number;
}

interface LLMCallResult {
  content: string;
  tokenInput: number;
  tokenOutput: number;
  latencyMs: number;
}

export async function callLLM(options: LLMCallOptions): Promise<LLMCallResult> {
  const start = Date.now();
  const client = getLLMClient();
  const model = getLLMModel();

  const completion = await client.chat.completions.create({
    model,
    messages: options.messages as any,
    response_format: options.response_format ?? undefined,
    temperature: options.temperature ?? 0.1,
  });

  const latencyMs = Date.now() - start;

  return {
    content: completion.choices[0]?.message?.content ?? '',
    tokenInput: completion.usage?.prompt_tokens ?? 0,
    tokenOutput: completion.usage?.completion_tokens ?? 0,
    latencyMs,
  };
}
