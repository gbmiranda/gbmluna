// Contrato de mensagens entre a extensão e o host nativo (gbml-host).
// O host implementa o mesmo contrato em host/Sources/GbmlHost/main.swift.

export const NATIVE_HOST_NAME = "com.gbml.host";

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

export type HostRequest =
  PingRequest | StartRequest | AudioChunkRequest | StopRequest;

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

// popup/offscreen ↔ background (mensagens internas da extensão)
export interface PingHostCommand {
  cmd: "ping-host";
}

export interface StartCaptionsCommand {
  cmd: "start-captions";
  tabId: number;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface StopCaptionsCommand {
  cmd: "stop-captions";
}

export interface GetStatusCommand {
  cmd: "get-status";
}

// background → offscreen
export interface OffscreenStartCommand {
  cmd: "offscreen-start";
  streamId: string;
}

export interface OffscreenStopCommand {
  cmd: "offscreen-stop";
}

// offscreen → background
export interface AudioChunkCommand {
  cmd: "audio-chunk";
  pcm: string;
}

// background → content script (overlay de legendas)
export interface CaptionPartialCommand {
  cmd: "caption-partial";
  text: string;
}

export interface CaptionFinalCommand {
  cmd: "caption-final";
  text: string;
  translated?: string;
}

export interface CaptionStatusCommand {
  cmd: "caption-status";
  message: string;
}

export interface CaptionClearCommand {
  cmd: "caption-clear";
}

export type CaptionCommand =
  | CaptionPartialCommand
  | CaptionFinalCommand
  | CaptionStatusCommand
  | CaptionClearCommand;

export type InternalCommand =
  | PingHostCommand
  | StartCaptionsCommand
  | StopCaptionsCommand
  | GetStatusCommand
  | OffscreenStartCommand
  | OffscreenStopCommand
  | AudioChunkCommand
  | CaptionCommand;

export interface PingHostResult {
  ok: boolean;
  hostVersion?: string;
  error?: string;
}

export interface CommandResult {
  ok: boolean;
  error?: string;
}

export interface CaptureStatus {
  capturing: boolean;
  tabId?: number;
  lastHostEvent?: string;
}
