import { NATIVE_HOST_NAME } from "./protocol";
import type {
  CaptionCommand,
  CaptureStatus,
  CommandResult,
  HostRequest,
  HostResponse,
  InternalCommand,
  PingHostResult,
} from "./protocol";

const STOP_CONFIRMATION_TIMEOUT_MS = 8000;

interface CaptureSession {
  tabId: number;
  port: chrome.runtime.Port;
  lastHostEvent?: string;
}

let session: CaptureSession | null = null;

function pingHost(sendResponse: (result: PingHostResult) => void): void {
  chrome.runtime.sendNativeMessage(
    NATIVE_HOST_NAME,
    { type: "ping" },
    (response: HostResponse) => {
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

function handleHostMessage(response: HostResponse): void {
  if (!session) {
    return;
  }
  session.lastHostEvent = JSON.stringify(response);

  switch (response.type) {
    case "partial":
      sendCaption(session.tabId, {
        cmd: "caption-partial",
        text: response.text,
      });
      break;
    case "final":
      sendCaption(session.tabId, {
        cmd: "caption-final",
        text: response.text,
        translated: response.translated,
      });
      break;
    case "status":
      sendCaption(session.tabId, {
        cmd: "caption-status",
        message: response.message,
      });
      break;
    case "error":
      sendCaption(session.tabId, {
        cmd: "caption-status",
        message: `Erro: ${response.message}`,
      });
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
  if (!session) {
    return;
  }
  const { tabId } = session;
  session = null;
  sendCaption(tabId, { cmd: "caption-clear" });
  void closeOffscreenDocument();
}

async function startCaptions(
  tabId: number,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<CommandResult> {
  if (session) {
    return { ok: false, error: "Já existe uma captura ativa." };
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

  const start: HostRequest = { type: "start", sourceLanguage, targetLanguage };
  port.postMessage(start);

  session = { tabId, port };
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
    function listener(response: HostResponse): void {
      if (response.type === "stopped") {
        finish();
      }
    }
    port.onMessage.addListener(listener);
  });
}

async function stopCaptions(): Promise<CommandResult> {
  if (!session) {
    return { ok: false, error: "Nenhuma captura ativa." };
  }
  const { port, tabId } = session;
  session = null;

  await chrome.runtime
    .sendMessage({ cmd: "offscreen-stop" })
    .catch(() => undefined);
  await closeOffscreenDocument();

  const stop: HostRequest = { type: "stop" };
  const stoppedConfirmation = waitForStopped(port);
  port.postMessage(stop);
  await stoppedConfirmation;
  port.disconnect();

  sendCaption(tabId, { cmd: "caption-clear" });
  return { ok: true };
}

function forwardAudioChunk(pcm: string): void {
  if (!session) {
    return;
  }
  const chunk: HostRequest = { type: "audio", pcm };
  session.port.postMessage(chunk);
}

function getStatus(): CaptureStatus {
  if (!session) {
    return { capturing: false };
  }
  return {
    capturing: true,
    tabId: session.tabId,
    lastHostEvent: session.lastHostEvent,
  };
}

chrome.runtime.onMessage.addListener(
  (message: InternalCommand, _sender, sendResponse) => {
    switch (message.cmd) {
      case "ping-host":
        pingHost(sendResponse);
        return true;
      case "start-captions":
        startCaptions(
          message.tabId,
          message.sourceLanguage,
          message.targetLanguage,
        )
          .then(sendResponse)
          .catch((error: Error) =>
            sendResponse({ ok: false, error: error.message }),
          );
        return true;
      case "stop-captions":
        stopCaptions()
          .then(sendResponse)
          .catch((error: Error) =>
            sendResponse({ ok: false, error: error.message }),
          );
        return true;
      case "audio-chunk":
        forwardAudioChunk(message.pcm);
        return false;
      case "get-status":
        sendResponse(getStatus());
        return false;
      default:
        return false;
    }
  },
);
