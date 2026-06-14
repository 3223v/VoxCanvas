/**
 * GET /api/canvas/[id]/sse
 *
 * SSE 端点 — 建立长连接，接收该画布的 AI 绘图事件流。
 */
import { NextRequest } from "next/server";
import { sseManager } from "@/lib/sse/sse-manager";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: canvasId } = await params;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      sseManager.add(canvasId, controller);
      controller.enqueue(encoder.encode(": ok\n\n"));

      // 心跳（15s）
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": hb\n\n")); } catch { /* nop */ }
      }, 15000);

      // 客户端断开 / 请求取消时清理
      const cleanup = () => {
        clearInterval(heartbeat);
        sseManager.remove(canvasId, controller);
        try { controller.close(); } catch { /* nop */ }
      };
      req.signal?.addEventListener("abort", cleanup, { once: true });

      // 定期检查是否已关闭
      const checkClosed = setInterval(() => {
        if (req.signal?.aborted) { clearInterval(checkClosed); cleanup(); }
      }, 5000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
