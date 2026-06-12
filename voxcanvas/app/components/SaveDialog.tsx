'use client';

import { useState } from 'react';

function randomName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

interface SaveDialogProps {
  open: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export default function SaveDialog({ open, onSave, onCancel }: SaveDialogProps) {
  const [name, setName] = useState('');

  const handleGenerate = () => setName(randomName());

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed) onSave(trimmed);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative bg-white rounded-2xl shadow-xl shadow-black/10 border border-gray-200/80 w-96 p-6 flex flex-col gap-4.5">
        <h3 className="text-sm font-medium text-gray-800">为画布命名</h3>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="输入名称..."
          autoFocus
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-100 transition-all duration-150 bg-gray-50/80"
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          maxLength={30}
        />

        <button
          type="button"
          onClick={handleGenerate}
          className="text-xs text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1.5 w-fit"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1,4 1,10 7,10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          随机生成名称
        </button>

        <div className="flex gap-3 justify-end mt-1">
          <button
            onClick={onCancel}
            className="px-5 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-all duration-150"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-5 py-2.5 bg-black text-white text-xs font-medium rounded-xl hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 shadow-md shadow-black/20"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
