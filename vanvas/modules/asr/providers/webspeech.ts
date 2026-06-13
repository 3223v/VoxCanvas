import { IStreamingProvider, StreamingCallbacks } from "../types";

// Web Speech API types (not in Next.js lib)
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
}
interface SpeechRecognitionClass {
  new(): SpeechRecognitionInstance;
}
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

export function createWebSpeechProvider(): IStreamingProvider {
  let rec: SpeechRecognitionInstance | null = null;

  return {
    name: "webspeech",

    async connect(lang: string, callbacks: StreamingCallbacks) {
      const SR = (
        (window as unknown as Record<string, unknown>).SpeechRecognition
        || (window as unknown as Record<string, unknown>).webkitSpeechRecognition
      ) as SpeechRecognitionClass | undefined;
      if (!SR) throw new Error("浏览器不支持语音识别");

      rec = new SR();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (e: SpeechRecognitionEvent) => {
        let interim = "";
        let final = "";
        for (let i = 0; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += t;
          else interim += t;
        }
        if (interim) callbacks.onInterim(interim);
        if (final) callbacks.onFinal(final);
      };

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        // network / not-allowed / service-not-allowed → Google services unreachable, silently ignore
        // Web Speech is the fast channel; the batch (GLM) channel still records and works
        if (e.error === "network" || e.error === "not-allowed" || e.error === "service-not-allowed") return;
        if (e.error !== "no-speech") callbacks.onError(new Error(e.error));
      };

      rec.start();
    },

    send() {},

    async stop() {
      rec?.stop();
      rec = null;
    },
  };
}
