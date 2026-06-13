/**
 * LLM Provider 抽象接口定义。
 *
 * 不绑定任何特定模型——用户通过环境变量配置。
 * 采用 OpenAI 兼容的 chat completions 协议，
 * 兼容 GLM、DeepSeek、OpenAI、Qwen 等主流服务。
 */

// ── 消息类型 ──────────────────────────────────────────

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ── 调用选项 ──────────────────────────────────────────

export interface LLMChatOptions {
  messages: LLMMessage[];
  /** 强制 JSON 输出（需要模型支持） */
  responseFormat?: { type: "json_object" };
  /** 采样温度 0-2，默认 0.1 */
  temperature?: number;
  /** 最大输出 token 数（不传则使用模型默认值） */
  maxTokens?: number;
}

// ── 调用结果 ──────────────────────────────────────────

export interface LLMChatResult {
  content: string;
  /** 实际使用的模型名 */
  model: string;
  /** 消耗的 token */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ── Provider 接口 ─────────────────────────────────────

/**
 * LLM Provider 抽象接口。
 *
 * 实现此接口以接入不同的 LLM 服务。
 * 内置实现：{@link createOpenAICompatProvider}
 */
export interface ILLMProvider {
  readonly name: string;
  chat(options: LLMChatOptions): Promise<LLMChatResult>;
}

// ── 配置 ──────────────────────────────────────────────

export interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}
