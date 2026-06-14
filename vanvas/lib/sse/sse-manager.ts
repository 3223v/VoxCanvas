/**
 * SSE 连接管理器 — 单例，内存中维护 canvasId → Stream 的映射。
 */
import type { SSEEvent } from "@/lib/types";

type SSEController = ReadableStreamDefaultController<Uint8Array>;

const encoder = new TextEncoder();

class SSEManager {
  private connections = new Map<string, Set<SSEController>>();

  add(canvasId: string, controller: SSEController): void {
    if (!this.connections.has(canvasId)) {
      this.connections.set(canvasId, new Set());
    }
    this.connections.get(canvasId)!.add(controller);
  }

  remove(canvasId: string, controller: SSEController): void {
    this.connections.get(canvasId)?.delete(controller);
    if (this.connections.get(canvasId)?.size === 0) {
      this.connections.delete(canvasId);
    }
  }

  /** 向指定画布的所有 SSE 连接推送事件 */
  emit(canvasId: string, event: SSEEvent): void {
    const streams = this.connections.get(canvasId);
    if (!streams || streams.size === 0) return;
    const payload = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    const bytes = encoder.encode(payload);
    for (const ctrl of streams) {
      try { ctrl.enqueue(bytes); } catch { /* 客户端已断开 */ }
    }
  }
}

export const sseManager = new SSEManager();
