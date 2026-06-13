"use client";

type Tool = "pen" | "line" | "dashed" | "arrow" | "arc-arrow" | "rect" | "diamond" | "circle" | "ellipse" | "text";

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  onClear: () => void;
  onUndo: () => void;
  canUndo: boolean;
}

const TOOLS: { type: Tool; label: string; icon: string }[] = [
  { type: "pen", label: "画笔", icon: "✎" },
  { type: "line", label: "直线", icon: "/" },
  { type: "dashed", label: "虚线", icon: "╌" },
  { type: "arrow", label: "箭头", icon: "→" },
  { type: "arc-arrow", label: "弧箭", icon: "↝" },
  { type: "rect", label: "矩形", icon: "□" },
  { type: "diamond", label: "菱形", icon: "◇" },
  { type: "circle", label: "圆形", icon: "○" },
  { type: "ellipse", label: "椭圆", icon: "⬭" },
  { type: "text", label: "文字", icon: "T" },
];

export default function Toolbar({ activeTool, onToolChange, onClear, onUndo, canUndo }: ToolbarProps) {
  return (
    <div className="flex items-center gap-1 p-1.5 bg-white border border-zinc-200 rounded-xl">
      {TOOLS.map((t) => (
        <button key={t.type}
          onClick={() => onToolChange(t.type)}
          title={t.label}
          className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md
            transition-all duration-200 cursor-pointer select-none
            ${activeTool === t.type
              ? "bg-zinc-900 text-white shadow-sm"
              : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"}`}
        >
          <span className="text-sm w-3.5 text-center shrink-0 leading-none">{t.icon}</span>
          <span className="hidden sm:inline">{t.label}</span>
        </button>
      ))}
      <div className="w-px h-5 bg-zinc-200 mx-0.5" />
      <button onClick={onUndo} disabled={!canUndo}
        className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md
                   text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800
                   transition-all cursor-pointer
                   disabled:opacity-30 disabled:cursor-not-allowed" title="撤销">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
        </svg>
      </button>
      <button onClick={onClear}
        className="flex items-center gap-1 px-2 py-1 text-[11px] rounded-md
                   text-zinc-500 hover:bg-red-50 hover:text-red-600
                   transition-all cursor-pointer" title="清空">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}
