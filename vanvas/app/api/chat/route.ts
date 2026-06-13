import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/chat — 诊断接口（ChatPanel 无 canvasId 时回退到此）。
 *
 * 返回明确的诊断信息：是画布未保存，还是 LLM 未配置。
 */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { message } = body as { message?: string };

  if (!message) {
    return NextResponse.json({ error: "No message" }, { status: 400 });
  }

  // 检查 LLM 配置状态
  const llmConfigured = !!(
    process.env.LLM_API_KEY &&
    process.env.LLM_BASE_URL &&
    process.env.LLM_MODEL_NAME
  );

  let hint = "⚠️ 画布尚未保存 — 请先点击工具栏左侧的保存按钮，保存画布后再使用 AI 绘图。";
  if (!llmConfigured) {
    hint += "\n\n⚠️ LLM 尚未配置 — 请在 .env.local 中设置 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL_NAME 三个环境变量。";
  }

  return NextResponse.json({
    reply: `收到你的消息：「${message}」。\n\n${hint}`,
  });
}
