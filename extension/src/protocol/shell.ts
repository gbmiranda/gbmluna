// Contrato da porta longa entre o shell Luna (app.html) e o background.
// O background multiplexa a porta nativa única e faz broadcast dos eventos de
// módulo para todas as instâncias do shell conectadas.
import type { CaptureStatus } from "./interno";

export const SHELL_PORT_NAME = "gbml-shell";

// shell → background
export interface ShellHelloMessage {
  kind: "hello";
  shellId: string;
}

export interface ShellModuleCommand {
  kind: "module-cmd";
  requestId: string;
  module: string;
  type: string;
  payload?: Record<string, unknown>;
}

export type ShellToBackground = ShellHelloMessage | ShellModuleCommand;

// background → shell
export interface ShellAck {
  kind: "ack";
  requestId: string;
  ok: boolean;
  error?: string;
}

export interface ShellModuleEvent {
  kind: "module-event";
  module: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface ShellStateSnapshot {
  kind: "state";
  translator: CaptureStatus;
}

export type BackgroundToShell = ShellAck | ShellModuleEvent | ShellStateSnapshot;
