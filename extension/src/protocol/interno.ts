// Mensagens internas da extensão (chave "cmd", nunca "type" — a distinção
// entre contrato interno e contrato ext↔host é deliberada).

// popup/offscreen ↔ background
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

export interface AbrirShellCommand {
  cmd: "abrir-shell";
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
  | AbrirShellCommand
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
