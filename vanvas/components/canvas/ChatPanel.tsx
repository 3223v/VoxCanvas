"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useASR } from "@/modules/asr/use-asr";
import { createGLMBatchProvider } from "@/modules/asr/providers/glm-asr";
import type { DrawObject } from "@/lib/types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  /** 当前画布 id（有值时启用 AI 绘图指令） */
  canvasId?: string;
  /** 画布 objects 变更回调 */
  onObjectsChange?: (objects: DrawObject[]) => void;
}

const glm = createGLMBatchProvider();
const BARS = 24;

export default function ChatPanel({ canvasId, onObjectsChange }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [sendingPhase, setSendingPhase] = useState(0);
  const sendingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const prevStatusRef = useRef("idle");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const asr = useASR({
    lang: "zh-CN",
    batch: glm,
  });

  // Toast auto-dismiss
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2000);
  }, []);

  // Auto-scroll messages
  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, asr.status, toast]);

  // Load command history when canvasId changes
  useEffect(() => {
    if (!canvasId) {
      setMessages([]);
      return;
    }
    fetch(`/api/canvas/${canvasId}/commands`)
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) setMessages(data.messages);
      })
      .catch(() => {}); // 静默失败，不影响使用
  }, [canvasId]);

  // Detect "processing → idle" transition: no text → show toast
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = asr.status;
    if (prev === "processing" && asr.status === "idle" && !asr.text) {
      showToast("未识别到语音，请重试");
    }
  }, [asr.status, asr.text, showToast]);

  // ── Cursor-aware insert ──────────────────────────────

  const insertAtCursor = useCallback((text: string) => {
    const ta = textareaRef.current;
    if (!ta) { setInput((prev) => prev + text); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setInput((prev) => prev.slice(0, start) + text + prev.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + text.length;
    });
  }, []);

  // ── Voice toggle ─────────────────────────────────────

  const handleVoiceToggle = async () => {
    if (asr.status === "listening") {
      const text = await asr.stop();
      if (text) insertAtCursor(text);
    } else {
      await asr.start();
    }
  };

  // ── Send message ─────────────────────────────────────

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || sending) return;
    setInput("");
    const userMsg: Message = { role: "user", content: msg };
    setMessages((prev) => [...prev, userMsg]);
    setSending(true);
    setSendingPhase(0);
    // 每 4 秒切换到下一阶段提示
    sendingTimerRef.current = setInterval(() => {
      setSendingPhase((p) => p + 1);
    }, 4000);

    try {
      if (canvasId) {
        // 有 canvasId → AI 绘图指令
        const res = await fetch(`/api/canvas/${canvasId}/command`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg }),
        });
        const data = await res.json();

        if (!res.ok) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: data.error ?? data.hint ?? `AI 绘图失败 (${res.status})`,
            },
          ]);
        } else {
          const reply = data.response ?? "(无回复)";
          const summary = data.summary as
            | { success: number; failed: number; total: number }
            | undefined;

          let content = reply;
          if (summary) {
            content += `\n\n---\n✅ ${summary.success} / ❌ ${summary.failed} / 📋 ${summary.total}`;
          }

          setMessages((prev) => [...prev, { role: "assistant", content }]);

          if (data.objects && onObjectsChange) {
            onObjectsChange(data.objects);
          }
        }
      } else {
        // 无 canvasId → 诊断接口（告知未保存）
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg }),
        });
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply || "(无回复)" },
        ]);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "发送失败";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ ${errorMsg}` },
      ]);
    } finally {
      setSending(false);
      if (sendingTimerRef.current) {
        clearInterval(sendingTimerRef.current);
        sendingTimerRef.current = null;
      }
    }
  };

  // ── Render ───────────────────────────────────────────

  return (
    <>
      {/* Collapse trigger tab */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 w-8 h-full flex items-center justify-center
                     bg-white border border-zinc-200 border-l-0 rounded-r-lg
                     hover:bg-zinc-50 transition-colors cursor-pointer
                     text-zinc-400 hover:text-zinc-600"
          title="展开对话"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* Expanded panel */}
      {open && (
        <div className="shrink-0 w-[26%] min-w-[264px] max-w-[384px] flex flex-col
                        bg-white border border-zinc-200 rounded-l-xl overflow-hidden
                        shadow-sm transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                asr.status === "listening" ? "bg-red-400 animate-pulse"
                : asr.status === "processing" ? "bg-amber-400"
                : "bg-emerald-400"
              }`} />
              <h3 className="text-sm font-medium text-zinc-700">对话</h3>
              {asr.status === "processing" && (
                <span className="text-[10px] text-amber-500">识别中…</span>
              )}
            </div>
            <button
              onClick={() => { asr.cancel(); setOpen(false); }}
              className="w-6 h-6 flex items-center justify-center rounded-md
                         text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100
                         transition-colors cursor-pointer"
              title="折叠"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Messages area */}
          <div ref={msgsRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5">
            {messages.length === 0 && asr.status !== "listening" && (
              <div className="flex justify-center py-8">
                <p className="text-xs text-zinc-300">暂无对话</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed
                  ${m.role === "user"
                    ? "bg-zinc-900 text-white rounded-br-md"
                    : "bg-zinc-100 text-zinc-700 rounded-bl-md"
                  }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {asr.status === "listening" && (
              <div className="flex justify-end">
                <div className="max-w-[85%] px-3 py-2 rounded-xl rounded-br-md text-xs
                                bg-zinc-200 text-zinc-500 italic animate-pulse">
                  {asr.text || "正在听…"}
                </div>
              </div>
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl rounded-bl-md bg-zinc-100 text-zinc-400 text-xs">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>
                    {sendingPhase === 0 ? "分析指令…"
                      : sendingPhase === 1 ? "规划任务…"
                      : sendingPhase === 2 ? "绘制中…"
                      : "处理中…"}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Waveform */}
          {asr.status === "listening" && (
            <div className="flex items-end justify-center gap-[2px] h-8 px-3 py-1 shrink-0">
              {asr.levels.slice(0, BARS).map((l, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full bg-zinc-900 transition-[height] duration-75"
                  style={{ height: `${Math.max(3, l * 28)}px` }}
                />
              ))}
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-zinc-100 p-3 shrink-0">
            <div className={`flex items-end gap-2 rounded-xl border transition-colors px-3 py-2
              ${asr.status === "listening"
                ? "bg-red-50 border-red-200"
                : "bg-zinc-50 border-zinc-200 focus-within:border-zinc-300 focus-within:bg-white"
              }`}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={asr.status === "listening" ? "正在录音…" : "输入消息…"}
                rows={2}
                className="flex-1 resize-none bg-transparent text-sm text-zinc-700
                           placeholder:text-zinc-300 outline-none min-h-[36px] max-h-[80px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />

              {/* Voice button */}
              <button
                onClick={handleVoiceToggle}
                disabled={asr.status === "processing"}
                className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg
                           transition-all cursor-pointer
                           ${asr.status === "listening"
                             ? "bg-red-500 text-white hover:bg-red-600 animate-pulse"
                             : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200"
                           }
                           disabled:opacity-40 disabled:cursor-not-allowed`}
                title={asr.status === "listening" ? "停止录音" : "语音输入"}
              >
                {asr.status === "listening" ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M19 10v2a7 7 0 01-14 0v-2" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19v4M8 23h8" />
                  </svg>
                )}
              </button>

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg
                           bg-zinc-900 text-white hover:bg-zinc-800
                           transition-colors cursor-pointer
                           disabled:opacity-30 disabled:cursor-not-allowed"
                title="发送"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5
                        bg-zinc-800 text-white text-sm rounded-xl shadow-lg
                        animate-in fade-in slide-in-from-bottom-4 transition-all duration-300">
          {toast}
        </div>
      )}
    </>
  );
}
