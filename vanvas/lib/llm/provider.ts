/**
 * OpenAI 兼容协议 LLM Provider。
 *
 * 环境变量（.env.local）：
 *   LLM_API_KEY    — API 密钥（必填）
 *   LLM_BASE_URL   — API 端点地址（必填，如 https://open.bigmodel.cn/api/paas/v4）
 *   LLM_MODEL_NAME — 模型名称（必填，如 glm-4-flash、deepseek-chat）
 *
 * 协议：POST {baseUrl}/chat/completions
 * 兼容智谱 GLM、DeepSeek、OpenAI、通义千问、Moonshot 等所有 OpenAI 兼容 API。
 */

import { ILLMProvider, LLMChatOptions, LLMChatResult, LLMConfig } from "./types";

// ── 配置加载 ──────────────────────────────────────────

function loadConfig(): LLMConfig {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL;
  const model = process.env.LLM_MODEL_NAME;

  if (!apiKey) throw new Error("缺少环境变量 LLM_API_KEY");
  if (!baseUrl) throw new Error("缺少环境变量 LLM_BASE_URL");
  if (!model) throw new Error("缺少环境变量 LLM_MODEL_NAME");

  // 去掉末尾斜杠，统一 URL 格式
  const normalizedUrl = baseUrl.replace(/\/+$/, "");

  return { apiKey, baseUrl: normalizedUrl, model };
}

// ── 自定义错误 ────────────────────────────────────────

class LLMError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "LLMError";
    this.status = status;
  }
}

// ── 重试工具 ──────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRIABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

// ── Provider 实现 ─────────────────────────────────────

let _provider: ILLMProvider | null = null;

export function createLLMProvider(config?: LLMConfig): ILLMProvider {
  const cfg = config ?? loadConfig();

  return {
    name: cfg.model,

    async chat(options: LLMChatOptions): Promise<LLMChatResult> {
      const maxRetries = 2;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const result = await doChat(cfg, options);

          // 如果有 responseFormat: json_object，额外校验 JSON 合法性
          if (
            options.responseFormat?.type === "json_object" &&
            attempt < maxRetries
          ) {
            try {
              JSON.parse(result.content);
            } catch {
              // JSON 不合法，重试
              lastError = new Error("LLM 返回的 JSON 不合法，重试");
              await sleep(500);
              continue;
            }
          }

          return result;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));

          // 不可重试的错误直接抛出
          if (err instanceof LLMError) {
            if (!RETRIABLE_STATUSES.has(err.status)) throw err;
          }

          if (attempt < maxRetries) {
            console.warn(
              `[LLM] 调用失败 (第 ${attempt + 1} 次)，500ms 后重试:`,
              lastError.message
            );
            await sleep(500);
          }
        }
      }

      throw lastError ?? new Error("LLM 调用失败");
    },
  };
}

// ── 核心调用函数 ──────────────────────────────────────

async function doChat(
  config: LLMConfig,
  options: LLMChatOptions
): Promise<LLMChatResult> {
  const url = `${config.baseUrl}/chat/completions`;

  const body: Record<string, unknown> = {
    model: config.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.1,
  };

  if (options.maxTokens !== undefined) {
    body.max_tokens = options.maxTokens;
  }

  if (options.responseFormat?.type === "json_object") {
    body.response_format = { type: "json_object" };
  }

  console.log(
    `[LLM] 调用 ${config.model} → ${url} (${options.messages.length} 条消息)`
  );

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "(无响应体)");
    throw new LLMError(
      `LLM API 返回 ${res.status}: ${errText.slice(0, 300)}`,
      res.status
    );
  }

  const data = await res.json();

  const content = data.choices?.[0]?.message?.content ?? "";

  console.log(
    `[LLM] 完成，返回 ${content.length} 字符` +
      (data.usage ? `，${data.usage.total_tokens} tokens` : "")
  );

  return {
    content,
    model: data.model ?? config.model,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          totalTokens: data.usage.total_tokens ?? 0,
        }
      : undefined,
  };
}

// ── 单例 ──────────────────────────────────────────────

/**
 * 获取全局 LLM Provider 单例。
 * 首次调用时从环境变量加载配置。
 */
export function getLLMProvider(): ILLMProvider {
  if (!_provider) {
    _provider = createLLMProvider();
  }
  return _provider;
}

/**
 * 重置单例（用于测试或配置变更后重新加载）。
 */
export function resetLLMProvider(): void {
  _provider = null;
}
