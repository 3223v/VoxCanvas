import OpenAI from 'openai';

let client: OpenAI | null = null;

function getEnvConfig() {
  const model = process.env.LLM_MODEL;
  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;

  if (!model || !baseURL || !apiKey) {
    throw new Error('LLM 配置缺失，请检查 .env.local 中的 LLM_MODEL / LLM_BASE_URL / LLM_API_KEY');
  }

  return { model, baseURL, apiKey };
}

export function getLLMClient(): OpenAI {
  if (!client) {
    const { apiKey, baseURL } = getEnvConfig();
    client = new OpenAI({ apiKey, baseURL });
  }
  return client;
}

export function getLLMModel(): string {
  return getEnvConfig().model;
}
