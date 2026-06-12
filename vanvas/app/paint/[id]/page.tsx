"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import PaintPageClient from "@/components/canvas/PaintPageClient";

export default function EditPaintPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<{
    title: string;
    canvasWidth: number;
    canvasHeight: number;
    objects: unknown[];
    loaded: boolean;
  }>({ title: "", canvasWidth: 1200, canvasHeight: 800, objects: [], loaded: false });

  useEffect(() => {
    if (!id) return;
    fetch(`/api/canvas/${id}`)
      .then((res) => res.json())
      .then((canvas) => {
        let objects: unknown[] = [];
        try {
          const state = JSON.parse(canvas.state || "{}");
          objects = state.objects || [];
        } catch {}
        setData({
          title: canvas.title,
          canvasWidth: canvas.canvasWidth,
          canvasHeight: canvas.canvasHeight,
          objects,
          loaded: true,
        });
      })
      .catch(() => setData((prev) => ({ ...prev, loaded: true })));
  }, [id]);

  if (!data.loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm text-zinc-300 animate-pulse">加载中...</span>
      </div>
    );
  }

  return (
    <PaintPageClient
      initialId={id}
      initialTitle={data.title}
      initialWidth={data.canvasWidth}
      initialHeight={data.canvasHeight}
      initialState={data.objects as any}
    />
  );
}
