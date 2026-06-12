export default function HomePage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8">
      <div className="flex flex-col items-center gap-12 max-w-2xl w-full">

        {/* ========== 头部品牌区 ========== */}
        <div className="flex flex-col items-center gap-6">
          {/* 线条交错 logo */}
          <div className="relative w-20 h-20">
            <div className="absolute top-1/2 left-0 w-full h-px bg-gray-200 -translate-y-1/2" />
            <div className="absolute top-0 left-1/2 w-px h-full bg-gray-200 -translate-x-1/2" />
            <div className="absolute top-1 left-1 right-1 bottom-1 border border-gray-100 rounded-full" />
            <div className="absolute top-[6px] left-[6px] right-[6px] bottom-[6px] border border-gray-100 rounded-full" />
            <div className="absolute top-0 left-0 w-full h-full border border-gray-200 rounded-full" />
          </div>

          <div className="flex flex-col items-center gap-3">
            <h1 className="text-5xl font-light text-gray-900 tracking-[0.15em]">
              VOX<span className="font-normal">CANVAS</span>
            </h1>
            <div className="flex items-center gap-3">
              <div className="w-8 h-px bg-gray-200" />
              <p className="text-xs text-gray-400 tracking-[0.25em] uppercase">
                Voice-Driven Drawing System
              </p>
              <div className="w-8 h-px bg-gray-200" />
            </div>
          </div>
        </div>

        {/* ========== 核心理念 ========== */}
        <div className="flex flex-col items-center gap-4">
          <p className="text-center text-gray-500 text-sm leading-7 max-w-md">
            通过语音指令与大型语言模型的深度协作，将你的创意实时转化为手绘风格的图形。
            说出你的想法，让 AI 为你执笔。
          </p>
        </div>

        {/* ========== 工作流程 —— 三列 ========== */}
        <div className="flex items-start gap-0 w-full">
          {/* 语音输入 */}
          <div className="flex-1 flex flex-col items-center gap-4 text-center">
            <div className="relative w-16 h-16 flex items-center justify-center">
          <div className="absolute inset-0 border border-gray-200/60 rounded-2xl" />
          <div className="absolute top-2 left-2 right-2 bottom-2 border border-gray-100/80 rounded-xl" />
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </div>
            <div>
              <p className="text-sm font-medium text-gray-800">语音输入</p>
              <p className="text-xs text-gray-400 mt-1">说出你的创意想法</p>
            </div>
          </div>

          {/* 箭头 1 */}
          <div className="flex items-center pt-7 -mx-1">
            <svg width="36" height="12" viewBox="0 0 36 12" fill="none" className="text-gray-300">
              <path d="M0 6h30" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
              <polyline points="26,2 32,6 26,10" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* LLM 处理 */}
          <div className="flex-1 flex flex-col items-center gap-4 text-center">
            <div className="relative w-16 h-16 flex items-center justify-center">
          <div className="absolute inset-0 border border-gray-200/60 rounded-2xl" />
          <div className="absolute top-2 left-2 right-2 bottom-2 border border-gray-100/80 rounded-xl" />
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
            <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2" />
          </svg>
        </div>
            <div>
              <p className="text-sm font-medium text-gray-800">LLM 理解</p>
              <p className="text-xs text-gray-400 mt-1">AI 解析意图生成指令</p>
            </div>
          </div>

          {/* 箭头 2 */}
          <div className="flex items-center pt-7 -mx-1">
            <svg width="36" height="12" viewBox="0 0 36 12" fill="none" className="text-gray-300">
              <path d="M0 6h30" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
              <polyline points="26,2 32,6 26,10" stroke="currentColor" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          {/* 图形绘制 */}
          <div className="flex-1 flex flex-col items-center gap-4 text-center">
            <div className="relative w-16 h-16 flex items-center justify-center">
          <div className="absolute inset-0 border border-gray-200/60 rounded-2xl" />
          <div className="absolute top-2 left-2 right-2 bottom-2 border border-gray-100/80 rounded-xl" />
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            <path d="M2 2l7.586 7.586" />
            <circle cx="11" cy="11" r="2" />
          </svg>
        </div>
            <div>
              <p className="text-sm font-medium text-gray-800">实时绘制</p>
              <p className="text-xs text-gray-400 mt-1">手绘风格图形即时呈现</p>
            </div>
          </div>
        </div>

        {/* ========== 分割 ========== */}
        <div className="flex items-center gap-4 w-full max-w-xs">
          <div className="flex-1 h-px bg-gray-100" />
          <div className="w-1 h-1 rounded-full bg-gray-300" />
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {/* ========== 特性区 ========== */}
        <div className="grid grid-cols-2 gap-x-16 gap-y-5">
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-lg border border-gray-200/60 flex items-center justify-center bg-gray-50/60">
              <div className="w-2 h-2 rounded-sm bg-gray-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">自然语言交互</p>
              <p className="text-xs text-gray-400 mt-0.5">无需学习复杂操作，直接用中文描述</p>
            </div>
          </div>
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-lg border border-gray-200/60 flex items-center justify-center bg-gray-50/60">
              <div className="w-2 h-2 rounded-sm bg-gray-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Rough.js 手绘风格</p>
              <p className="text-xs text-gray-400 mt-0.5">所有图形呈现自然的手绘质感</p>
            </div>
          </div>
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-lg border border-gray-200/60 flex items-center justify-center bg-gray-50/60">
              <div className="w-2 h-2 rounded-sm bg-gray-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">多轮对话编辑</p>
              <p className="text-xs text-gray-400 mt-0.5">持续对话，逐步完善你的作品</p>
            </div>
          </div>
          <div className="flex items-start gap-3.5">
            <div className="mt-0.5 w-5 h-5 flex-shrink-0 rounded-lg border border-gray-200/60 flex items-center justify-center bg-gray-50/60">
              <div className="w-2 h-2 rounded-sm bg-gray-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">本地持久化</p>
              <p className="text-xs text-gray-400 mt-0.5">SQLite 本地存储，数据安全可控</p>
            </div>
          </div>
        </div>

        {/* ========== CTA ========== */}
        <div className="flex gap-4">
          <a
            href="/draw"
            className="inline-flex items-center gap-2 px-8 py-3 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors whitespace-nowrap shadow-lg shadow-black/15"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <circle cx="11" cy="11" r="2" />
            </svg>
            开始绘画
          </a>
          <a
            href="/my"
            className="inline-flex items-center gap-2 px-8 py-3 border border-gray-200/60 text-sm font-medium text-gray-600 rounded-xl hover:bg-gray-50/80 hover:border-gray-300/60 transition-colors whitespace-nowrap"
          >
            查看作品
          </a>
        </div>
      </div>
    </div>
  );
}
