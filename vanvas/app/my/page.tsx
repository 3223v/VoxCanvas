"use client";

import { useState, useEffect, useCallback } from "react";
import CanvasCard from "@/components/gallery/CanvasCard";
import { CanvasDTO } from "@/services/canvas.service";

export default function MyPage() {
  const [canvases, setCanvases] = useState<CanvasDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCanvases = useCallback(async () => {
    try {
      const res = await fetch("/api/canvas");
      if (res.ok) {
        const data = await res.json();
        setCanvases(data);
      }
    } catch (e) {
      console.error("Failed to fetch canvases:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCanvases();
  }, [fetchCanvases]);

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/canvas/${id}`, { method: "DELETE" });
      setCanvases((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error("Failed to delete canvas:", e);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-6 gap-6 overflow-auto">
      {/* Header — sticky */}
      <div className="flex items-center justify-between sticky top-0 bg-zinc-50/80 backdrop-blur-sm z-10 -mx-6 px-6 py-3 -mt-3">
        <div>
          <h1 className="text-lg font-medium text-zinc-800">我的绘画</h1>
          <p className="text-xs text-zinc-400 mt-1">
            共 {canvases.length} 个画布
          </p>
        </div>
        <a
          href="/paint"
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium
                     rounded-lg bg-zinc-900 text-white hover:bg-zinc-800
                     transition-colors cursor-pointer"
        >
          <span>✎</span> 新建
        </a>
      </div>

      {/* Divider */}
      <div className="border-t border-zinc-200" />

      {/* Loading */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-sm text-zinc-300 animate-pulse">加载中...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && canvases.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-16">
          <span className="text-5xl text-zinc-200">▦</span>
          <p className="text-zinc-400 text-sm">还没有绘画作品</p>
          <a
            href="/paint"
            className="text-sm text-zinc-500 hover:text-zinc-800 underline
                       underline-offset-2 decoration-zinc-200 transition-colors"
          >
            开始你的第一幅画
          </a>
        </div>
      )}

      {/* Gallery grid */}
      {!loading && canvases.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {canvases.map((canvas) => (
            <CanvasCard
              key={canvas.id}
              canvas={canvas}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Decorative line at bottom */}
      <div className="border-t border-zinc-100 mt-auto" />
    </div>
  );
}
