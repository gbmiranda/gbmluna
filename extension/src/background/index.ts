// Registro dos listeners do service worker: comandos internos (popup e
// offscreen), portas do shell Luna e menu de contexto.
import { TRANSLATOR_MODULE } from "../protocol";
import type { InternalCommand } from "../protocol";
import { anexarContextMenu } from "./context-menu";
import { anexarShellHub, registrarComandante } from "./shell-hub";
import { abrirShell } from "./shell-window";
import {
  forwardAudioChunk,
  getStatus,
  pingHost,
  startCaptions,
  stopCaptions,
} from "./translator-session";

// Comandos vindos do shell (porta longa): o tradutor não inicia captura em
// aba fria (tabCapture exige gesto), então o shell só para/focaliza.
registrarComandante(async (module, type, payload) => {
  if (module !== TRANSLATOR_MODULE) {
    return { ok: false, error: `módulo desconhecido: ${module}` };
  }
  switch (type) {
    case "stop":
      return stopCaptions();
    case "focar-aba": {
      const tabId = payload.tabId;
      if (typeof tabId !== "number") {
        return { ok: false, error: "focar-aba sem tabId" };
      }
      const aba = await chrome.tabs.get(tabId);
      if (aba.windowId !== undefined) {
        await chrome.windows.update(aba.windowId, { focused: true });
      }
      await chrome.tabs.update(tabId, { active: true });
      return { ok: true };
    }
    default:
      return { ok: false, error: `comando desconhecido: ${type}` };
  }
}, getStatus);

anexarShellHub();
anexarContextMenu();

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
      case "abrir-shell":
        abrirShell()
          .then(() => sendResponse({ ok: true }))
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
