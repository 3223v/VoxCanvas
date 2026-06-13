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

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus" : "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    recorder.ondataavailable = (e: BlobEvent) => {
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

  const stop = useCallback(async () => {
    setStatus("processing");

    procRef.current?.disconnect();
    cancelAnimationFrame(animRef.current);
    setLevels(new Array(BARS).fill(0));

    const blob = await new Promise<Blob | null>((resolve) => {
      const rec = recRef.current;
      if (!rec || rec.state === "inactive") return resolve(null);
      rec.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
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

  const cancel = useCallback(() => {
    streaming.stop().catch(() => {});
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    cancelAnimationFrame(animRef.current);
    setText("");
    setLevels(new Array(BARS).fill(0));
    setStatus("idle");
  }, [streaming]);

  useEffect(() => () => { cancel(); }, [cancel]);

  return { status, text, wasCorrected, levels, start, stop, cancel };
}
