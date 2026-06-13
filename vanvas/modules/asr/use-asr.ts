/**
 * useASR — 语音识别 Hook（简化版）。
 *
 * 录音 → 发送到 GLM-ASR 批处理 → 返回文本。
 * 去掉了 Web Speech 快通道，单一 GLM 通道，逻辑简单可靠。
 */
"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { ASRConfig, ASRState } from "./types";

const BARS = 32;

export function useASR(config: ASRConfig): ASRState {
  const { lang = "zh-CN", batch } = config;

  const [status, setStatus] = useState<ASRState["status"]>("idle");
  const [text, setText] = useState("");
  const [levels, setLevels] = useState<number[]>(new Array(BARS).fill(0));

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animRef = useRef(0);

  // ── 波形动画 ──────────────────────────────────────────

  const startLevels = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(buf);
      const s = Math.floor(buf.length / BARS);
      setLevels(
        Array.from({ length: BARS }, (_, i) => (buf[i * s] || 0) / 255)
      );
      animRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  // ── start ──────────────────────────────────────────────

  const start = useCallback(async () => {
    console.log("[ASR] 开始录音");
    setStatus("listening");
    setText("");
    chunksRef.current = [];

    // 获取麦克风
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: { ideal: 16000 },
        channelCount: { ideal: 1 },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;

    // AudioContext + 分析器（波形可视化）
    const ctx = new AudioContext({ sampleRate: 16000 });
    const src = ctx.createMediaStreamSource(stream);
    ctxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    src.connect(analyser);
    analyserRef.current = analyser;
    startLevels();

    // MediaRecorder（收集音频数据）
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(200);
    recRef.current = recorder;

    console.log("[ASR] 录音中...");
  }, [startLevels]);

  // ── stop ───────────────────────────────────────────────

  const stop = useCallback(async (): Promise<string> => {
    console.log("[ASR] 停止录音");
    setStatus("processing");

    // 停止波形动画
    cancelAnimationFrame(animRef.current);
    setLevels(new Array(BARS).fill(0));

    // 收集录音数据
    const blob = await new Promise<Blob | null>((resolve) => {
      const rec = recRef.current;
      if (!rec || rec.state === "inactive") return resolve(null);
      rec.onstop = () =>
        resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      rec.stop();
    });

    // 清理资源
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    streamRef.current = null;
    ctxRef.current = null;
    recRef.current = null;
    analyserRef.current = null;

    console.log("[ASR] 录音完成, blob_size:", blob?.size ?? 0);

    // GLM 转写
    if (batch && blob && blob.size > 500) {
      console.log("[ASR] 调用 GLM-ASR...");
      try {
        const result = await batch.transcribe(blob, lang);
        console.log("[ASR] GLM 结果:", JSON.stringify(result));
        if (result) {
          setText(result);
          setStatus("idle");
          return result;
        }
      } catch (err) {
        console.warn("[ASR] GLM 失败:", err);
      }
    }

    setStatus("idle");
    return "";
  }, [batch, lang]);

  // ── cancel ─────────────────────────────────────────────

  const cancel = useCallback(() => {
    console.log("[ASR] 取消录音");
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    cancelAnimationFrame(animRef.current);
    setText("");
    setLevels(new Array(BARS).fill(0));
    setStatus("idle");
  }, []);

  // 组件卸载时清理
  useEffect(() => () => { cancel(); }, [cancel]);

  return { status, text, levels, start, stop, cancel };
}
