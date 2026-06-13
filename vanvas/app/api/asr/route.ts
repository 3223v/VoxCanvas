import { NextRequest, NextResponse } from "next/server";

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const audio = form.get("audio") as Blob | null;
  const language = (form.get("language") as string) || "zh";

  console.log("[ASR-API] 收到请求, audio_size:", audio?.size ?? 0, "type:", audio?.type ?? "?", "lang:", language);

  if (!audio) {
    console.log("[ASR-API] 无音频数据");
    return NextResponse.json({ error: "No audio" }, { status: 400 });
  }

  // Validate WAV header on server side
  const header = new Uint8Array(await audio.slice(0, 44).arrayBuffer());
  const riff = String.fromCharCode(...header.slice(0, 4));
  const wave = String.fromCharCode(...header.slice(8, 12));
  const fmtSize = new DataView(header.buffer).getUint32(16, true);
  const channels = new DataView(header.buffer).getUint16(22, true);
  const sr = new DataView(header.buffer).getUint32(24, true);
  const bits = new DataView(header.buffer).getUint16(34, true);
  const dataChunk = String.fromCharCode(...header.slice(36, 40));
  const dataSize = new DataView(header.buffer).getUint32(40, true);
  console.log(
    "[ASR-API] WAV header:", riff, wave,
    "fmt_size:", fmtSize, "ch:", channels, "sr:", sr, "bits:", bits,
    "data:", dataChunk, "data_size:", dataSize,
    "total:", audio.size
  );

  if (!ZHIPU_API_KEY) {
    console.log("[ASR-API] 未配置 ZHIPU_API_KEY，跳过 GLM 调用");
    return NextResponse.json({ text: "" });
  }

  try {
    console.log("[ASR-API] 调用 GLM-ASR...");
    const glmForm = new FormData();
    glmForm.append("file", audio, "recording.wav");
    glmForm.append("model", "glm-asr-2512");

    const res = await fetch(
      "https://open.bigmodel.cn/api/paas/v4/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${ZHIPU_API_KEY}` },
        body: glmForm,
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[ASR-API] GLM 返回错误 status:", res.status, "body:", errText);
      return NextResponse.json({ text: "" });
    }

    const data = await res.json();
    console.log("[ASR-API] GLM 返回 text:", JSON.stringify(data.text ?? ""));
    return NextResponse.json({ text: data.text || "" });
  } catch (err) {
    console.error("[ASR-API] 异常:", err);
    return NextResponse.json({ text: "" });
  }
}
