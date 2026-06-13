import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { message } = body as { message?: string };

  if (!message) {
    return NextResponse.json({ error: "No message" }, { status: 400 });
  }

  return NextResponse.json({
    reply: `收到你的消息：「${message}」。这是一个默认回复，AI 对话功能尚未接入。`,
  });
}
