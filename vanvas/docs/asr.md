# Web Speech API（快） + GLM-ASR（慢）设计文档

---

## 架构

```
用户说话
   │
   ├─→ Web Speech API ──→ 实时出字（快，200ms，偶尔有错）
   │                      → 立即展示 + 发送对话
   │
   └─→ MediaRecorder ──→ 录音完成 ──→ POST /api/asr ──→ GLM-ASR
                                     （异步，1~2s，更准）
                                      → 文本不同时静默替换
```

就这么简单。两条通道，一次合并，完事。

## 文件结构

```
src/
├── modules/asr/
│   ├── types.ts             # 类型
│   ├── use-asr.ts           # Hook（唯一对外接口）
│   └── providers/
│       ├── webspeech.ts     # 快通道
│       └── glm-asr.ts       # 慢通道
├── app/
│   ├── page.tsx             # 页面
│   └── api/asr/route.ts     # GLM-ASR 代理
└── .env.local               # ZHIPU_API_KEY
```

**5 个文件。**

## 1. 类型

```typescript
// src/modules/asr/types.ts

export interface StreamingCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (error: Error) => void;
}

export interface IStreamingProvider {
  readonly name: string;
  connect(lang: string, callbacks: StreamingCallbacks): Promise<void>;
  send(data: ArrayBuffer): void;
  stop(): Promise<void>;
}

export interface IBatchProvider {
  readonly name: string;
  transcribe(audio: Blob, lang: string): Promise<string>;
}

export interface ASRConfig {
  lang?: string;
  streaming: IStreamingProvider;
  batch?: IBatchProvider;
}

export interface ASRState {
  status: "idle" | "listening" | "processing" | "verifying";
  text: string;                 // 当前显示文本（快通道 → 可能被慢通道替换）
  wasCorrected: boolean;        // 慢通道是否替换了文本
  levels: number[];             // 波形数据
  start: () => Promise<void>;
  stop: () => Promise<string>;  // 返回快通道文本
  cancel: () => void;
}
```

## 2. Web Speech API（快通道）

```typescript
// src/modules/asr/providers/webspeech.ts

import { IStreamingProvider, StreamingCallbacks } from "../types";

export function createWebSpeechProvider(): IStreamingProvider {
  let rec: any = null;

  return {
    name: "webspeech",

    async connect(lang, callbacks) {
      const SR =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      if (!SR) throw new Error("浏览器不支持语音识别");

      rec = new SR();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (e: any) => {
        let interim = "";
        let final = "";
        for (let i = 0; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += t;
          else interim += t;
        }
        if (interim) callbacks.onInterim(interim);
        if (final) callbacks.onFinal(final);
      };

      rec.onerror = (e: any) => {
        if (e.error !== "no-speech") callbacks.onError(new Error(e.error));
      };

      rec.start();
    },

    send() {},

    async stop() {
      rec?.stop();
      rec = null;
    },
  };
}
```

## 3. GLM-ASR（慢通道）

```typescript
// src/modules/asr/providers/glm-asr.ts

import { IBatchProvider } from "../types";

export function createGLMBatchProvider(apiUrl = "/api/asr"): IBatchProvider {
  return {
    name: "glm-asr",

    async transcribe(audio, lang) {
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
```

## 4. 核心 Hook

```typescript
// src/modules/asr/use-asr.ts

"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { ASRConfig, ASRState } from "./types";

const BARS = 32;

export function useASR(config: ASRConfig): ASRState {
  const { lang = "zh-CN", streaming, batch } = config;

  const [status, setStatus] = useState<ASRState["status"]>("idle");
  const [text, setText] = useState("");
  const [wasCorrected, setWasCorrected] = useState(false);
  const [levels, setLevels] = useState<number[]>(new Array(BARS).fill(0));

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const finalRef = useRef("");
  const animRef = useRef(0);

  // ── 波形动画 ──
  const startLevels = useCallback((analyser: AnalyserNode) => {
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(buf);
      const s = Math.floor(buf.length / BARS);
      setLevels(Array.from({ length: BARS }, (_, i) => (buf[i * s] || 0) / 255));
      animRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  // ── start ──
  const start = useCallback(async () => {
    setStatus("listening");
    setText("");
    setWasCorrected(false);
    finalRef.current = "";
    chunksRef.current = [];

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    streamRef.current = stream;

    const ctx = new AudioContext({ sampleRate: 16000 });
    const src = ctx.createMediaStreamSource(stream);
    ctxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    src.connect(analyser);
    startLevels(analyser);

    const proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => {
      const f = e.inputBuffer.getChannelData(0);
      const i16 = new Int16Array(f.length);
      for (let i = 0; i < f.length; i++) {
        const v = Math.max(-1, Math.min(1, f[i]));
        i16[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      streaming.send(i16.buffer);
    };
    src.connect(proc);
    proc.connect(ctx.destination);
    procRef.current = proc;

    const recorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm",
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(200);
    recRef.current = recorder;

    await streaming.connect(lang, {
      onInterim: (t) => setText(t),
      onFinal: (t) => { setText(t); finalRef.current = t; },
      onError: (err) => console.error("[快通道]", err.message),
    });
  }, [streaming, lang, startLevels]);

  // ── stop ──
  const stop = useCallback(async () => {
    setStatus("processing");

    procRef.current?.disconnect();
    cancelAnimationFrame(animRef.current);
    setLevels(new Array(BARS).fill(0));

    const blob = await new Promise<Blob | null>((r) => {
      const rec = recRef.current;
      if (!rec || rec.state === "inactive") return r(null);
      rec.onstop = () => r(new Blob(chunksRef.current, { type: "audio/webm" }));
      rec.stop();
    });

    await streaming.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    streamRef.current = null;
    ctxRef.current = null;
    procRef.current = null;
    recRef.current = null;

    const fastText = finalRef.current;

    // 异步慢通道
    if (batch && blob && blob.size > 2000 && fastText) {
      setStatus("verifying");
      batch
        .transcribe(blob, lang)
        .then((slowText) => {
          if (slowText && slowText !== fastText) {
            setText(slowText);
            setWasCorrected(true);
          }
        })
        .catch((err) => console.warn("[慢通道] 失败:", err))
        .finally(() => setStatus("idle"));
    } else {
      setStatus("idle");
    }

    return fastText;
  }, [streaming, batch, lang]);

  // ── cancel ──
  const cancel = useCallback(() => {
    streaming.stop().catch(() => {});
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    cancelAnimationFrame(animRef.current);
    setText("");
    setStatus("idle");
  }, [streaming]);

  useEffect(() => () => cancel(), [cancel]);

  return { status, text, wasCorrected, levels, start, stop, cancel };
}
```

## 5. API Route

```typescript
// src/app/api/asr/route.ts

import { NextRequest, NextResponse } from "next/server";

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY!;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const audio = form.get("audio") as Blob;
  const language = (form.get("language") as string) || "zh";

  if (!audio) {
    return NextResponse.json({ error: "No audio" }, { status: 400 });
  }

  const glmForm = new FormData();
  glmForm.append("file", audio, "recording.webm");
  glmForm.append("model", "glm-asr");
  glmForm.append("language", language);

  const res = await fetch(
    "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${ZHIPU_API_KEY}` },
      body: glmForm,
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error("[GLM-ASR]", err);
    return NextResponse.json({ error: "ASR failed" }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.json({ text: data.text || "" });
}
```

## 6. 页面使用

```tsx
// src/app/page.tsx

"use client";
import { useState } from "react";
import { useASR } from "@/modules/asr/use-asr";
import { createWebSpeechProvider } from "@/modules/asr/providers/webspeech";
import { createGLMBatchProvider } from "@/modules/asr/providers/glm-asr";

const webspeech = createWebSpeechProvider();
const glm = createGLMBatchProvider();

export default function Page() {
  const [messages, setMessages] = useState<
    { role: string; content: string; corrected?: boolean }[]
  >([]);

  const asr = useASR({
    lang: "zh-CN",
    streaming: webspeech,
    batch: glm,
  });

  const toggle = async () => {
    if (asr.status === "listening") {
      const text = await asr.stop();
      if (text) {
        setMessages((p) => [...p, { role: "user", content: text }]);
      }
    } else {
      await asr.start();
    }
  };

  // 监听慢通道纠正
  if (asr.wasCorrected && asr.status === "idle") {
    // 慢通道替换了 text，更新最后一条消息
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "user" && last.content !== asr.text) {
        return [
          ...prev.slice(0, -1),
          { ...last, content: asr.text, corrected: true },
        ];
      }
      return prev;
    });
  }

  return (
    <main>
      {messages.map((m, i) => (
        <div key={i} className={m.role}>
          {m.content}
          {m.corrected && <small> ✓</small>}
        </div>
      ))}

      {asr.status === "listening" && (
        <div className="interim">{asr.text || "正在听..."}</div>
      )}
      {asr.status === "verifying" && <div className="hint">优化中...</div>}

      <div className="wave">
        {asr.levels.map((l, i) => (
          <div key={i} style={{ height: `${Math.max(4, l * 48)}px` }} />
        ))}
      </div>

      <button onClick={toggle} disabled={asr.status === "processing"}>
        {asr.status === "listening" ? "⏹" : "🎤"}
      </button>
    </main>
  );
}
```

## 7. 环境变量

```bash
# .env.local
ZHIPU_API_KEY=your-key
```

## 8. 数据流

```
用户: "帮我订明天去上海的机票"
│
├─ 快通道 (200ms)
│  "帮我订明天去上海的机票"   ← 90% 概率正确
│  → 立即显示 + 发送对话
│
├─ 慢通道 (1~2s, 异步)
│  音频 → GLM-ASR → "帮我订明天去上海的机票"
│
└─ 对比
   快 = 慢 → 不做任何事（大多数情况）
   快 ≠ 慢 → 静默替换文本，标记 ✓
```