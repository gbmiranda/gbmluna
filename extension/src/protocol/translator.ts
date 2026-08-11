// Contrato do módulo tradutor (payloads idênticos ao protocolo flat original;
// no modo envelope as mesmas mensagens ganham { module: "translator" }).
// O host implementa em host/Sources/GbmlHost/Modules/TranslatorModule.swift.

// Áudio enviado ao host: PCM Int16 little-endian, mono, 16 kHz, base64.
export const AUDIO_SAMPLE_RATE = 16000;

// extensão → host
export interface PingRequest {
  type: "ping";
}

export interface StartRequest {
  type: "start";
  // BCP-47; ausente = detectar automaticamente
  sourceLanguage?: string;
  targetLanguage: string;
}

export interface AudioChunkRequest {
  type: "audio";
  pcm: string;
}

export interface StopRequest {
  type: "stop";
}

export interface TranslationStatusRequest {
  type: "translation-status";
  sourceLanguage: string;
  targetLanguage: string;
}

export type HostRequest =
  | PingRequest
  | StartRequest
  | AudioChunkRequest
  | StopRequest
  | TranslationStatusRequest;

// host → extensão
export interface PongResponse {
  type: "pong";
  hostVersion: string;
}

export interface StartedResponse {
  type: "started";
}

export interface StoppedResponse {
  type: "stopped";
  bytesReceived: number;
  secondsReceived: number;
}

export interface StatusResponse {
  type: "status";
  message: string;
}

export interface PartialResponse {
  type: "partial";
  text: string;
}

export interface FinalResponse {
  type: "final";
  text: string;
  translated?: string;
}

export interface TranslationStatusResponse {
  type: "translation-status";
  sourceLanguage: string;
  targetLanguage: string;
  status: "installed" | "supported" | "unsupported";
}

export interface ErrorResponse {
  type: "error";
  message: string;
}

export type HostResponse =
  | PongResponse
  | StartedResponse
  | StoppedResponse
  | StatusResponse
  | PartialResponse
  | FinalResponse
  | TranslationStatusResponse
  | ErrorResponse;
