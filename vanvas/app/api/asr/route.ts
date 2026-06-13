import { NextRequest, NextResponse } from "next/server";

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const audio = form.get("audio") as Blob | null;
  const language = (form.get("language") as string) || "zh";

  if (!audio) {
    return NextResponse.json({ error: "No audio" }, { status: 400 });
  }

  // If no API key configured, return empty — user still gets fast-channel text
  if (!ZHIPU_API_KEY) {
    return NextResponse.json({ text: "" });
  }

  try {
    const glmForm = new FormData();
    glmForm.append("file", audio, "recording.webm");
    glmForm.append("model", "glm-asr");
    glmForm.append("language", language);

    const res = await fetch(
      "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${ZHIPU_API_KEY}` },
        body: glmForm,
      }
    );

    if (!res.ok) {
      console.error("[GLM-ASR]", await res.text().catch(() => ""));
      return NextResponse.json({ text: "" });
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text || "" });
  } catch (err) {
    console.error("[GLM-ASR] Error:", err);
    return NextResponse.json({ text: "" });
  }
}
