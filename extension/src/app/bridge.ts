// Ponte do shell com o background: porta longa com reconexão idempotente,
// comandos com ack por requestId e assinatura de eventos de módulo.
import { SHELL_PORT_NAME } from "../protocol";
import type {
  BackgroundToShell,
  CaptureStatus,
  ShellToBackground,
} from "../protocol";

const ACK_TIMEOUT_MS = 10000;
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 4000;

export interface EventoModulo {
  module: string;
  type: string;
  payload: Record<string, unknown>;
}

type OuvinteEvento = (evento: EventoModulo) => void;
type OuvinteEstado = (translator: CaptureStatus) => void;

interface Pendente {
  resolver: (resultado: { ok: boolean; error?: string }) => void;
  timer: number;
}

export interface Bridge {
  comandar(
    module: string,
    type: string,
    payload?: Record<string, unknown>,
  ): Promise<{ ok: boolean; error?: string }>;
  aoEvento(ouvinte: OuvinteEvento): void;
  aoEstado(ouvinte: OuvinteEstado): void;
}

export function criarBridge(): Bridge {
  const shellId = crypto.randomUUID();
  const pendentes = new Map<string, Pendente>();
  const ouvintesEvento = new Set<OuvinteEvento>();
  const ouvintesEstado = new Set<OuvinteEstado>();
  let porta: chrome.runtime.Port | null = null;
  let tentativa = 0;

  function conectar(): void {
    porta = chrome.runtime.connect({ name: SHELL_PORT_NAME });
    porta.onMessage.addListener(receber);
    porta.onDisconnect.addListener(() => {
      porta = null;
      // backoff exponencial curto: o SW MV3 pode ter sido recolhido e volta
      const espera = Math.min(
        RECONNECT_BASE_MS * 2 ** tentativa,
        RECONNECT_MAX_MS,
      );
      tentativa += 1;
      setTimeout(conectar, espera);
    });
    tentativa = 0;
    enviar({ kind: "hello", shellId });
  }

  function enviar(mensagem: ShellToBackground): void {
    try {
      porta?.postMessage(mensagem);
    } catch {
      // porta caiu entre o check e o envio; o onDisconnect reconecta
    }
  }

  function receber(mensagem: BackgroundToShell): void {
    switch (mensagem.kind) {
      case "ack": {
        const pendente = pendentes.get(mensagem.requestId);
        if (pendente) {
          clearTimeout(pendente.timer);
          pendentes.delete(mensagem.requestId);
          pendente.resolver({ ok: mensagem.ok, error: mensagem.error });
        }
        break;
      }
      case "module-event":
        for (const ouvinte of ouvintesEvento) {
          ouvinte({
            module: mensagem.module,
            type: mensagem.type,
            payload: mensagem.payload,
          });
        }
        break;
      case "state":
        for (const ouvinte of ouvintesEstado) {
          ouvinte(mensagem.translator);
        }
        break;
    }
  }

  conectar();

  return {
    comandar(module, type, payload) {
      const requestId = crypto.randomUUID();
      return new Promise((resolver) => {
        const timer = window.setTimeout(() => {
          pendentes.delete(requestId);
          resolver({
            ok: false,
            error: "tempo esgotado aguardando o background",
          });
        }, ACK_TIMEOUT_MS);
        pendentes.set(requestId, { resolver, timer });
        enviar({ kind: "module-cmd", requestId, module, type, payload });
      });
    },
    aoEvento(ouvinte) {
      ouvintesEvento.add(ouvinte);
    },
    aoEstado(ouvinte) {
      ouvintesEstado.add(ouvinte);
    },
  };
}
