'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DrawingCanvas from '@/app/components/DrawingCanvas';
import SaveDialog from '@/app/components/SaveDialog';
import type { DrawingAction, CanvasDrawState } from '@/lib/types/canvas';

export default function DrawPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canvasId = searchParams.get('id');

  const [title, setTitle] = useState('未命名画布');
  const [initialActions, setInitialActions] = useState<DrawingAction[] | undefined>();
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(canvasId);
  const pendingActionsRef = useRef<DrawingAction[]>([]);

  useEffect(() => {
    if (!canvasId) return;
    fetch(`/api/canvases/${canvasId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.data) {
          setTitle(res.data.title);
          const state: CanvasDrawState = JSON.parse(res.data.state);
          setInitialActions(state.actions ?? []);
          setSavedId(res.data.id);
        }
      })
      .catch(console.error);
  }, [canvasId]);

  const handleSave = (actions: DrawingAction[]) => {
    pendingActionsRef.current = actions;

    if (savedId) {
      doSave(savedId, title, actions);
    } else {
      setShowSaveDialog(true);
    }
  };

  const doSave = async (id: string, name: string, actions: DrawingAction[]) => {
    setIsSaving(true);
    try {
      const state: CanvasDrawState = { actions, canvasWidth: 1200, canvasHeight: 800 };
      await fetch(`/api/canvases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: name, state: JSON.stringify(state), version: 0 }),
      });
      setTitle(name);
      setSavedId(id);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDialogConfirm = async (name: string) => {
    setShowSaveDialog(false);
    setIsSaving(true);
    try {
      const actions = pendingActionsRef.current;
      const state: CanvasDrawState = { actions, canvasWidth: 1200, canvasHeight: 800 };
      const res = await fetch('/api/canvases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: name, state: JSON.stringify(state) }),
      });
      const data = await res.json();
      if (data.data) {
        setTitle(name);
        setSavedId(data.data.id);
        router.replace(`/draw?id=${data.data.id}`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏 */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-medium text-gray-800 truncate">{title}</h2>
          {savedId && (
            <span className="flex-shrink-0 text-[10px] text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
              已保存
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <DrawingCanvas
          key={canvasId ?? 'new'}
          initialActions={initialActions}
          onSave={handleSave}
          isSaving={isSaving}
        />
      </div>

      <SaveDialog
        open={showSaveDialog}
        onSave={handleSaveDialogConfirm}
        onCancel={() => setShowSaveDialog(false)}
      />
    </div>
  );
}
