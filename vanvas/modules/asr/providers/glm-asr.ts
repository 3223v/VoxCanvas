import { IBatchProvider } from "../types";

export function createGLMBatchProvider(apiUrl = "/api/asr"): IBatchProvider {
  return {
    name: "glm-asr",

    async transcribe(audio: Blob, lang: string): Promise<string> {
      const form = new FormData();
      form.append("audio", audio, "recording.webm");
      form.append("language", lang === "zh-CN" ? "zh" : lang);

      const res = await fetch(apiUrl, { method: "POST", body: form });
      if (!res.ok) throw new Error(`GLM-ASR 失败: ${res.status}`);

      const data = await res.json();
      return data.text || "";
    },
  };
}
