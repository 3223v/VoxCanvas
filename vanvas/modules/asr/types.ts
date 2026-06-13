export interface StreamingCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (error: Error) => void;
}

export interface IStreamingProvider {
  readonly name: string;
  connect(lang: string, callbacks: StreamingCallbacks): Promise<void>;
  send(data: ArrayBuffer): void;
  stop(): Promise<void>;
}

export interface IBatchProvider {
  readonly name: string;
  transcribe(audio: Blob, lang: string): Promise<string>;
}

export interface ASRConfig {
  lang?: string;
  streaming: IStreamingProvider;
  batch?: IBatchProvider;
}

export interface ASRState {
  status: "idle" | "listening" | "processing" | "verifying";
  text: string;
  wasCorrected: boolean;
  levels: number[];
  start: () => Promise<void>;
  stop: () => Promise<string>;
  cancel: () => void;
}
