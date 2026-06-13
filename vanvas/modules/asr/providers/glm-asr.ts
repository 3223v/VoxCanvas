import { IBatchProvider } from "../types";

const TARGET_SAMPLE_RATE = 16000;

// Convert any browser-supported audio Blob to 16kHz mono WAV (linear16 PCM)
async function blobToWav(blob: Blob): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    console.log(
      "[WAV] 解码完成: sr=", audioBuffer.sampleRate,
      "ch=", audioBuffer.numberOfChannels,
      "len=", audioBuffer.length,
      "dur=", (audioBuffer.duration).toFixed(2) + "s"
    );
    const wavBuffer = audioBufferToWav(audioBuffer);
    return new Blob([wavBuffer], { type: "audio/wav" });
  } finally {
    ctx.close();
  }
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const srcData = buffer.getChannelData(0);
  const srcRate = buffer.sampleRate;

  // Resample to 16kHz if needed
  let samples: Float32Array;
  if (srcRate === TARGET_SAMPLE_RATE) {
    samples = srcData;
  } else {
    const ratio = srcRate / TARGET_SAMPLE_RATE;
    const newLen = Math.floor(srcData.length / ratio);
    samples = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      samples[i] = srcData[Math.floor(i * ratio)];
    }
    console.log("[WAV] 重采样:", srcRate, "→", TARGET_SAMPLE_RATE, "samples:", newLen);
  }

  // Compute RMS to check audio level, then apply gain for speech recognition
  const TARGET_RMS = 0.1; // -20dBFS, optimal for ASR
  let rms = 0;
  for (let i = 0; i < samples.length; i++) rms += samples[i] * samples[i];
  rms = Math.sqrt(rms / samples.length);
  const gain = rms > 0.0001 ? TARGET_RMS / rms : 1;
  console.log("[WAV] RMS:", rms.toFixed(4),
    rms < 0.001 ? "(极安静)" : "(有声音)",
    "→ gain:", gain.toFixed(1) + "x",
    gain > 1.5 ? "⚠大幅增益" : "");

  const numChannels = 1;
  const sampleRate = TARGET_SAMPLE_RATE;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);

  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, "WAVE");

  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] * gain));
    const intSample = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  return buf;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export function createGLMBatchProvider(apiUrl = "/api/asr"): IBatchProvider {
  return {
    name: "glm-asr",

    async transcribe(audio: Blob, lang: string): Promise<string> {
      console.log("[GLM-ASR] 原始音频大小:", audio.size, "类型:", audio.type);

      // Convert to WAV — GLM-ASR only supports .wav / .mp3
      let wavBlob: Blob;
      try {
        wavBlob = await blobToWav(audio);
        console.log("[GLM-ASR] 转换为 WAV, 大小:", wavBlob.size);
      } catch (err) {
        console.error("[GLM-ASR] WAV 转换失败:", err);
        throw err;
      }

      const form = new FormData();
      form.append("audio", wavBlob, "recording.wav");
      form.append("language", lang === "zh-CN" ? "zh" : lang);

      const res = await fetch(apiUrl, { method: "POST", body: form });
      if (!res.ok) throw new Error(`GLM-ASR 失败: ${res.status}`);

      const data = await res.json();
      return data.text || "";
    },
  };
}
