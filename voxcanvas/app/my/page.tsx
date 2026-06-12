'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import CanvasCard from '@/app/components/CanvasCard';
import CanvasPreview from '@/app/components/CanvasPreview';
import type { CanvasListItem } from '@/lib/services/canvas-service';

export default function MyPage() {
  const router = useRouter();
  const [canvases, setCanvases] = useState<CanvasListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewCanvas, setPreviewCanvas] = useState<{ title: string; state: string; id: string } | null>(null);

  const fetchCanvases = useCallback(() => {
    setLoading(true);
    fetch('/api/canvases')
      .then((r) => r.json())
      .then((res) => setCanvases(res.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchCanvases(); }, [fetchCanvases]);

  const handlePreview = (canvas: CanvasListItem) => {
    fetch(`/api/canvases/${canvas.id}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.data) {
          setPreviewCanvas({
            id: res.data.id,
            title: res.data.title,
            state: res.data.state,
          });
        }
      })
      .catch(console.error);
  };

  const handleEdit = (id: string) => {
    router.push(`/draw?id=${id}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此画布吗？')) return;
    await fetch(`/api/canvases/${id}`, { method: 'DELETE' });
    setCanvases((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <h2 className="text-sm font-medium text-gray-800">我的画布</h2>
        <span className="text-xs text-gray-400">{canvases.length} 个作品</span>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2.5 text-gray-400 text-sm">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin" />
              加载中...
            </div>
          </div>
        ) : canvases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="relative w-16 h-16">
              <div className="absolute top-1/2 left-0 w-full h-px bg-gray-200 -translate-y-1/2" />
              <div className="absolute top-0 left-1/2 w-px h-full bg-gray-200 -translate-x-1/2" />
              <div className="absolute top-0 left-0 w-full h-full border border-gray-200 rounded-2xl" />
            </div>
            <p className="text-sm text-gray-400">还没有作品</p>
            <a
              href="/draw"
              className="inline-flex items-center px-5 py-2.5 bg-black text-white text-xs font-medium rounded-lg hover:bg-gray-800 transition-all duration-150 shadow-sm"
            >
              开始创作
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {canvases.map((c) => (
              <CanvasCard
                key={c.id}
                canvas={c}
                onClick={() => handlePreview(c)}
                onEdit={() => handleEdit(c.id)}
                onDelete={() => handleDelete(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      <CanvasPreview
        open={previewCanvas !== null}
        canvas={previewCanvas}
        onClose={() => setPreviewCanvas(null)}
        onEdit={() => {
          if (previewCanvas) handleEdit(previewCanvas.id);
          setPreviewCanvas(null);
        }}
      />
    </div>
  );
}
