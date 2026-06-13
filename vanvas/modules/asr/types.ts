/**
 * ASR 类型定义（简化版 — 仅 GLM 批处理通道）。
 */

export interface IBatchProvider {
  readonly name: string;
  /** 将音频 Blob 转写为文本 */
  transcribe(audio: Blob, lang: string): Promise<string>;
}

export interface ASRConfig {
  /** 识别语言，默认 "zh-CN" */
  lang?: string;
  /** 批处理转写 provider（GLM-ASR） */
  batch: IBatchProvider;
}

export interface ASRState {
  status: "idle" | "listening" | "processing";
  text: string;
  /** 波形可视化数据（32 个 0~1 的值） */
  levels: number[];
  /** 开始录音 */
  start: () => Promise<void>;
  /** 停止录音并返回转写文本 */
  stop: () => Promise<string>;
  /** 取消录音 */
  cancel: () => void;
}
