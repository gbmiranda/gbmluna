// Sessão de captura do tradutor: dona da porta nativa (formato envelope),
// do offscreen document e do fan-out de legendas — content script da aba
// capturada E broadcast para o shell Luna.
import { NATIVE_HOST_NAME, TRANSLATOR_MODULE } from "../protocol";
import type {
  CaptionCommand,
  CaptureStatus,
  CommandResult,
  HostEnvelopeRequest,
  HostEnvelopeResponse,
  PingHostResult,
} from "../protocol";
import { broadcast, broadcastEstado } from "./shell-hub";

const STOP_CONFIRMATION_TIMEOUT_MS = 8000;

interface SessaoCaptura {
  tabId: number;
  port: chrome.runtime.Port;
  lastHostEvent?: string;
}

let sessao: SessaoCaptura | null = null;

export function pingHost(sendResponse: (result: PingHostResult) => void): void {
  const ping: HostEnvelopeRequest = { module: "core", type: "ping" };
  chrome.runtime.sendNativeMessage(
    NATIVE_HOST_NAME,
    ping,
    (response: HostEnvelopeResponse) => {
      if (chrome.runtime.lastError) {
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      if (response.type !== "pong") {
        sendResponse({
          ok: false,
          error: `resposta inesperada do host: ${response.type}`,
        });
        return;
      }
      sendResponse({ ok: true, hostVersion: response.hostVersion });
    },
  );
}

async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (contexts.length > 0) {
    return;
  }
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Capturar o áudio da aba para gerar legendas localmente",
  });
}

async function closeOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (contexts.length === 0) {
    return;
  }
  await chrome.offscreen.closeDocument();
}

function sendCaption(tabId: number, command: CaptionCommand): void {
  chrome.tabs.sendMessage(tabId, command).catch(() => {
    // aba fechada ou content script ausente; nada a fazer
  });
}

function handleHostMessage(response: HostEnvelopeResponse): void {
  if (!sessao) {
    return;
  }
  sessao.lastHostEvent = JSON.stringify(response);

  switch (response.type) {
    case "partial":
      sendCaption(sessao.tabId, {
        cmd: "caption-partial",
        text: response.text,
      });
      broadcast(TRANSLATOR_MODULE, "partial", { text: response.text });
      break;
    case "final":
      sendCaption(sessao.tabId, {
        cmd: "caption-final",
        text: response.text,
        translated: response.translated,
      });
      broadcast(TRANSLATOR_MODULE, "final", {
        text: response.text,
        translated: response.translated ?? null,
      });
      break;
    case "status":
      sendCaption(sessao.tabId, {
        cmd: "caption-status",
        message: response.message,
      });
      broadcast(TRANSLATOR_MODULE, "status", { message: response.message });
      break;
    case "error":
      sendCaption(sessao.tabId, {
        cmd: "caption-status",
        message: `Erro: ${response.message}`,
      });
      broadcast(TRANSLATOR_MODULE, "error", { message: response.message });
      break;
    default:
      break;
  }
}

function handleHostDisconnect(): void {
  const error = chrome.runtime.lastError;
  if (error) {
    console.error("host desconectou:", error.message);
  }
  if (!sessao) {
    return;
  }
  const { tabId } = sessao;
  sessao = null;
  sendCaption(tabId, { cmd: "caption-clear" });
  broadcast(TRANSLATOR_MODULE, "cleared", {});
  broadcastEstado();
  void closeOffscreenDocument();
}

export async function startCaptions(
  tabId: number,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<CommandResult> {
  if (sessao) {
    // Idempotência: repetir o start da mesma aba confirma a sessão vigente.
    if (sessao.tabId === tabId) {
      return { ok: true };
    }
    return { ok: false, error: "Já existe uma captura ativa em outra aba." };
  }

  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tabId,
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
  await ensureOffscreenDocument();

  const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  port.onMessage.addListener(handleHostMessage);
  port.onDisconnect.addListener(handleHostDisconnect);

  const start: HostEnvelopeRequest = {
    module: TRANSLATOR_MODULE,
    type: "start",
    sourceLanguage,
    targetLanguage,
  };
  port.postMessage(start);

  sessao = { tabId, port };
  sendCaption(tabId, {
    cmd: "caption-status",
    message: "Preparando modelos locais…",
  });

  const offscreenResult: CommandResult = await chrome.runtime.sendMessage({
    cmd: "offscreen-start",
    streamId,
  });
  if (!offscreenResult.ok) {
    await stopCaptions();
    return { ok: false, error: `captura falhou: ${offscreenResult.error}` };
  }

  broadcastEstado();
  return { ok: true };
}

/// Espera o host confirmar o "stopped" (finais pendentes já emitidos) antes de
/// desconectar a porta — desconectar cedo mataria o host no meio da finalização.
function waitForStopped(port: chrome.runtime.Port): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, STOP_CONFIRMATION_TIMEOUT_MS);
    function finish(): void {
      clearTimeout(timer);
      port.onMessage.removeListener(listener);
      resolve();
    }
    function listener(response: HostEnvelopeResponse): void {
      if (response.type === "stopped") {
        finish();
      }
    }
    port.onMessage.addListener(listener);
  });
}

export async function stopCaptions(): Promise<CommandResult> {
  if (!sessao) {
    // Idempotência: parar sem captura confirma o estado já parado.
    return { ok: true };
  }
  const { port, tabId } = sessao;
  sessao = null;

  await chrome.runtime
    .sendMessage({ cmd: "offscreen-stop" })
    .catch(() => undefined);
  await closeOffscreenDocument();

  const stop: HostEnvelopeRequest = { module: TRANSLATOR_MODULE, type: "stop" };
  const stoppedConfirmation = waitForStopped(port);
  port.postMessage(stop);
  await stoppedConfirmation;
  port.disconnect();

  sendCaption(tabId, { cmd: "caption-clear" });
  broadcast(TRANSLATOR_MODULE, "cleared", {});
  broadcastEstado();
  return { ok: true };
}

export function forwardAudioChunk(pcm: string): void {
  if (!sessao) {
    return;
  }
  const chunk: HostEnvelopeRequest = {
    module: TRANSLATOR_MODULE,
    type: "audio",
    pcm,
  };
  sessao.port.postMessage(chunk);
}

export function getStatus(): CaptureStatus {
  if (!sessao) {
    return { capturing: false };
  }
  return {
    capturing: true,
    tabId: sessao.tabId,
    lastHostEvent: sessao.lastHostEvent,
  };
}
