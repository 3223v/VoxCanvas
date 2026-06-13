"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import RoughCanvas from "@/components/canvas/RoughCanvas";
import ChatPanel from "@/components/canvas/ChatPanel";
import SaveDialog from "./SaveDialog";
import { randomName } from "@/lib/utils";

import type { DrawObject } from "@/lib/types";

interface PaintPageClientProps {
  initialId?: string;
  initialTitle?: string;
  initialWidth?: number;
  initialHeight?: number;
  initialState?: DrawObject[];
}

export default function PaintPageClient({
  initialId, initialTitle, initialWidth = 1200, initialHeight = 800, initialState = [],
}: PaintPageClientProps) {
  const router = useRouter();
  const [canvasWidth, setCanvasWidth] = useState(initialWidth);
  const [canvasHeight, setCanvasHeight] = useState(initialHeight);
  const [objects, setObjects] = useState<DrawObject[]>(initialState);
  const [title, setTitle] = useState(initialTitle || "");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [canvasId, setCanvasId] = useState(initialId || "");
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async (name: string) => {
    setSaving(true);
    try {
      const state = JSON.stringify({ objects });
      const isUpdate = !!canvasId;
      const url = isUpdate ? `/api/canvas/${canvasId}` : "/api/canvas";
      const res = await fetch(url, {
        method: isUpdate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: name, canvasWidth, canvasHeight, state }),
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setTitle(name);
      setCanvasId(data.id);
      if (!isUpdate) router.replace(`/paint/${data.id}`);
    } catch (e) {
      alert("保存失败: " + e);
    } finally {
      setSaving(false);
      setShowSaveDialog(false);
    }
  }, [objects, canvasId, canvasWidth, canvasHeight, router]);

  const handleSaveClick = () => {
    if (!canvasId && !title) setShowSaveDialog(true);
    else if (title) handleSave(title);
    else setShowSaveDialog(true);
  };

  return (
    <div className="flex-1 flex flex-col p-6 gap-4 overflow-hidden h-full">
      <div className="flex-1 min-h-0 flex gap-0">
        <div className="flex-1 min-w-0">
          <RoughCanvas
            width={canvasWidth} height={canvasHeight}
            objects={objects} onObjectsChange={setObjects}
            onCanvasSizeChange={async (w, h) => {
              setCanvasWidth(w);
              setCanvasHeight(h);
              // 已保存的画布：立即持久化尺寸变更
              if (canvasId) {
                await fetch(`/api/canvas/${canvasId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ canvasWidth: w, canvasHeight: h }),
                });
              }
            }}
            title={title} canvasId={canvasId}
            onSaveClick={handleSaveClick} saving={saving}
            onTitleChange={async (newTitle) => {
              setTitle(newTitle);
              if (canvasId) {
                // 已保存的画布：立即持久化到后端
                await fetch(`/api/canvas/${canvasId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: newTitle }),
                });
              }
            }}
          />
        </div>
        <ChatPanel canvasId={canvasId || undefined} onObjectsChange={setObjects} />
      </div>

      {showSaveDialog && (
        <SaveDialog
          initialName={title} onSave={handleSave}
          onClose={() => setShowSaveDialog(false)}
          onRandomName={() => randomName(5)}
        />
      )}
    </div>
  );
}
