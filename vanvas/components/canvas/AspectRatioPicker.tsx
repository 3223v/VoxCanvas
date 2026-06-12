"use client";

interface AspectRatioPickerProps {
  width: number;
  height: number;
  onChange: (width: number, height: number) => void;
}

const RATIOS = [
  { label: "16:9", w: 1600, h: 900 },
  { label: "4:3", w: 1200, h: 900 },
  { label: "1:1", w: 1000, h: 1000 },
  { label: "3:2", w: 1200, h: 800 },
  { label: "9:16", w: 900, h: 1600 },
];

export default function AspectRatioPicker({
  width,
  height,
  onChange,
}: AspectRatioPickerProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-400 uppercase tracking-wider shrink-0">比例</span>
      <div className="flex gap-1">
        {RATIOS.map((r) => {
          const isActive = r.w === width && r.h === height;
          return (
            <button
              key={r.label}
              onClick={() => onChange(r.w, r.h)}
              className={`
                px-2.5 py-1.5 text-xs rounded-lg border transition-all duration-200 cursor-pointer
                ${isActive
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 text-zinc-500 hover:border-zinc-400 hover:text-zinc-800"
                }
              `}
            >
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
