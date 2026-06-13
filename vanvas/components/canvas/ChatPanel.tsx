"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useASR } from "@/modules/asr/use-asr";
import { createWebSpeechProvider } from "@/modules/asr/providers/webspeech";
import { createGLMBatchProvider } from "@/modules/asr/providers/glm-asr";

interface Message {
  role: "user" | "assistant";
  content: string;
  corrected?: boolean;
}

const webspeech = createWebSpeechProvider();
const glm = createGLMBatchProvider();
const BARS = 24;

export default function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const msgsRef = useRef<HTMLDivElement>(null);

  const asr = useASR({
    lang: "zh-CN",
    streaming: webspeech,
    batch: glm,
  });

  // Auto-scroll messages
  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, asr.status]);

  // Watch for slow-channel correction: update last user message
  useEffect(() => {
    if (asr.wasCorrected && asr.status === "idle" && messages.length > 0) {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "user" && last.content !== asr.text) {
          return [...prev.slice(0, -1), { ...last, content: asr.text, corrected: true }];
        }
        return prev;
      });
    }
  }, [asr.wasCorrected, asr.status, asr.text, messages.length]);

  // ── Cursor-aware insert ──────────────────────────────

  const insertAtCursor = useCallback((text: string) => {
    const ta = textareaRef.current;
    if (!ta) { setInput((prev) => prev + text); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    setInput((prev) => prev.slice(0, start) + text + prev.slice(end));
    // Restore cursor after render
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
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply || "(无回复)" }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "发送失败，请重试。" }]);
    } finally {
      setSending(false);
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
        <div className="shrink-0 w-[22%] min-w-[220px] max-w-[320px] flex flex-col
                        bg-white border border-zinc-200 rounded-l-xl overflow-hidden
                        shadow-sm transition-all duration-300">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                asr.status === "listening" ? "bg-red-400 animate-pulse"
                : asr.status === "verifying" ? "bg-amber-400"
                : "bg-emerald-400"
              }`} />
              <h3 className="text-sm font-medium text-zinc-700">对话</h3>
              {asr.status === "verifying" && (
                <span className="text-[10px] text-amber-500">优化中…</span>
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
                  {m.corrected && (
                    <span className="ml-1 text-[9px] text-emerald-300" title="已由慢通道纠正">✓</span>
                  )}
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
                <div className="px-3 py-2 rounded-xl rounded-bl-md bg-zinc-100 text-zinc-400 text-xs animate-pulse">
                  …
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
                             ? "bg-red-500 text-white hover:bg-red-600"
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
    </>
  );
}
