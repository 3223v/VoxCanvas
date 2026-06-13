/**
 * GET /api/canvas/[id]/commands
 *
 * 返回画布的命令历史（用于 ChatPanel 恢复对话记录）。
 */
import { NextRequest, NextResponse } from "next/server";
import commandRepo from "@/lib/persistence/command-repo";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: canvasId } = await params;

  try {
    const commands = commandRepo.getRecent(canvasId, 50);
    const messages = commands
      .filter((c) => !c.isUndo)
      .reverse() // 最早的在前面
      .flatMap((c) => {
        const items: { role: "user" | "assistant"; content: string }[] = [];
        items.push({ role: "user", content: c.inputText });
        if (c.aiResponse) {
          items.push({ role: "assistant", content: c.aiResponse });
        }
        return items;
      });

    return NextResponse.json({ messages });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
