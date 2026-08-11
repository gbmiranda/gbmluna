// Envelope de módulo do protocolo ext↔host (docs/twoddd.md, seção "Protocolo
// modular"): toda mensagem carrega o módulo dono do contrato. O host aceita o
// formato flat legado na mesma conexão (dual-mode decidido na primeira mensagem).
import type { HostRequest, HostResponse } from "./translator";

export const NATIVE_HOST_NAME = "com.gbml.host";

export const CORE_MODULE = "core";
export const TRANSLATOR_MODULE = "translator";
export const INTEL_MODULE = "intel";

export interface ModuleEnvelope {
  module: string;
  type: string;
  // Ecoado nas respostas diretas; base da correlação e da idempotência no
  // multiplex da porta nativa única.
  requestId?: string;
}

// core: capacidades do host (o pong lista os módulos disponíveis)
export interface CorePingRequest {
  module: typeof CORE_MODULE;
  type: "ping";
  requestId?: string;
}

export interface CorePongResponse {
  module: typeof CORE_MODULE;
  type: "pong";
  hostVersion: string;
  modules: string[];
  requestId?: string;
}

export interface CoreErrorResponse {
  module: typeof CORE_MODULE;
  type: "error";
  message: string;
  requestId?: string;
}

export type HostEnvelopeRequest =
  | CorePingRequest
  | ({ module: typeof TRANSLATOR_MODULE; requestId?: string } & HostRequest);

export type HostEnvelopeResponse =
  | CorePongResponse
  | CoreErrorResponse
  | ({ module: typeof TRANSLATOR_MODULE; requestId?: string } & HostResponse);

export function isEnvelope(message: unknown): message is ModuleEnvelope {
  if (typeof message !== "object" || message === null) {
    return false;
  }
  const candidate = message as Record<string, unknown>;
  if (typeof candidate.module !== "string") {
    return false;
  }
  return typeof candidate.type === "string";
}
