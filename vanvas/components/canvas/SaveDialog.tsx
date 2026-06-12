"use client";

import { useState } from "react";

interface SaveDialogProps {
  initialName: string;
  onSave: (name: string) => void;
  onClose: () => void;
  onRandomName: () => string;
}

export default function SaveDialog({
  initialName,
  onSave,
  onClose,
  onRandomName,
}: SaveDialogProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("请输入名称");
      return;
    }
    onSave(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className="bg-white rounded-xl shadow-2xl border border-zinc-200 p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-medium text-zinc-800 mb-4">
          保存画布
        </h3>

        <label className="block text-xs text-zinc-400 mb-1.5">
          画布名称
        </label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            placeholder="输入画布名称"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            className="flex-1 px-3 py-2 text-sm border border-zinc-200 rounded-lg
                       outline-none focus:border-zinc-400 transition-colors"
          />
          <button
            onClick={() => setName(onRandomName())}
            className="px-3 py-2 text-xs rounded-lg border border-zinc-200
                       text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800
                       transition-colors cursor-pointer whitespace-nowrap"
          >
            随机
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-500 mt-1">{error}</p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-200
                       text-zinc-500 hover:bg-zinc-50 transition-colors cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm rounded-lg bg-zinc-900 text-white
                       hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
