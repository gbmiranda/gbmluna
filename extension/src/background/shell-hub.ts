// Hub das portas longas do shell Luna: broadcast de eventos de módulo para
// todas as instâncias abertas e despacho dos comandos que chegam delas.
import { SHELL_PORT_NAME } from "../protocol";
import type {
  BackgroundToShell,
  CaptureStatus,
  ShellToBackground,
} from "../protocol";

type Comandante = (
  module: string,
  type: string,
  payload: Record<string, unknown>,
) => Promise<{ ok: boolean; error?: string }>;

const portas = new Set<chrome.runtime.Port>();
let comandante: Comandante | null = null;
let estadoAtual: (() => CaptureStatus) | null = null;

export function registrarComandante(
  handler: Comandante,
  estado: () => CaptureStatus,
): void {
  comandante = handler;
  estadoAtual = estado;
}

export function anexarShellHub(): void {
  chrome.runtime.onConnect.addListener((porta) => {
    if (porta.name !== SHELL_PORT_NAME) {
      return;
    }
    portas.add(porta);
    porta.onDisconnect.addListener(() => {
      portas.delete(porta);
    });
    porta.onMessage.addListener((mensagem: ShellToBackground) => {
      void despachar(porta, mensagem);
    });
  });
}

async function despachar(
  porta: chrome.runtime.Port,
  mensagem: ShellToBackground,
): Promise<void> {
  if (mensagem.kind === "hello") {
    // Snapshot inicial: o shell recém-conectado precisa saber o estado do
    // tradutor sem esperar o próximo evento.
    if (estadoAtual) {
      enviar(porta, { kind: "state", translator: estadoAtual() });
    }
    return;
  }
  if (mensagem.kind !== "module-cmd") {
    return;
  }
  let resultado: { ok: boolean; error?: string };
  if (!comandante) {
    resultado = { ok: false, error: "background ainda inicializando" };
  } else {
    try {
      resultado = await comandante(
        mensagem.module,
        mensagem.type,
        mensagem.payload ?? {},
      );
    } catch (erro) {
      resultado = { ok: false, error: (erro as Error).message };
    }
  }
  enviar(porta, {
    kind: "ack",
    requestId: mensagem.requestId,
    ok: resultado.ok,
    error: resultado.error,
  });
}

export function broadcast(
  module: string,
  type: string,
  payload: Record<string, unknown>,
): void {
  for (const porta of portas) {
    enviar(porta, { kind: "module-event", module, type, payload });
  }
}

export function broadcastEstado(): void {
  if (!estadoAtual) {
    return;
  }
  for (const porta of portas) {
    enviar(porta, { kind: "state", translator: estadoAtual() });
  }
}

function enviar(porta: chrome.runtime.Port, mensagem: BackgroundToShell): void {
  try {
    porta.postMessage(mensagem);
  } catch {
    // porta fechou entre o broadcast e o envio; o onDisconnect limpa
    portas.delete(porta);
  }
}
