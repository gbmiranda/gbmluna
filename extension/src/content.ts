import type { CaptionCommand } from "./protocol";

// Overlay de legendas: injetado sob demanda quando a captura começa.
// Shadow DOM isola o estilo da página; a caixa segue o maior <video> visível
// (inclusive em fullscreen, movendo o host para dentro do elemento fullscreen).

const FINAL_HOLD_MS = 5000;
const REPOSITION_INTERVAL_MS = 500;

declare global {
  interface Window {
    __gbmlOverlayLoaded?: boolean;
  }
}

function createOverlay() {
  const host = document.createElement("div");
  host.id = "gbml-caption-host";
  host.style.cssText =
    "all: initial; position: fixed; z-index: 2147483647; pointer-events: none;";

  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    .caption {
      display: none;
      max-width: 88%;
      margin: 0 auto;
      padding: 0.35em 0.7em;
      border-radius: 0.4em;
      background: rgba(0, 0, 0, 0.75);
      color: #ffffff;
      font-family: -apple-system, system-ui, sans-serif;
      font-weight: 500;
      line-height: 1.35;
      text-align: center;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
      width: fit-content;
      white-space: pre-wrap;
    }
    .caption.visible {
      display: block;
    }
    .caption.partial {
      color: rgba(255, 255, 255, 0.85);
    }
    .caption.status {
      font-style: italic;
      color: rgba(255, 255, 255, 0.75);
    }
  `;
  const box = document.createElement("div");
  box.className = "caption";
  const line = document.createElement("span");
  box.appendChild(line);
  shadow.append(style, box);

  return { host, box, line };
}

function findTargetVideo(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll("video"));
  let best: HTMLVideoElement | null = null;
  let bestArea = 0;
  for (const video of videos) {
    const rect = video.getBoundingClientRect();
    const area = rect.width * rect.height;
    const isVisible =
      area > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
    if (isVisible && area > bestArea) {
      best = video;
      bestArea = area;
    }
  }
  return best;
}

function init() {
  const { host, box, line } = createOverlay();
  document.documentElement.appendChild(host);

  let clearTimer: number | undefined;

  function reposition() {
    const video = findTargetVideo();
    if (!video) {
      // Sem vídeo na tela: legenda no rodapé da janela.
      host.style.left = "0px";
      host.style.right = "0px";
      host.style.bottom = "10vh";
      host.style.top = "auto";
      box.style.fontSize = "18px";
      return;
    }
    const rect = video.getBoundingClientRect();
    host.style.left = `${rect.left}px`;
    host.style.right = "auto";
    host.style.top = `${Math.min(rect.bottom, window.innerHeight) - rect.height * 0.14}px`;
    host.style.bottom = "auto";
    host.style.width = `${rect.width}px`;
    const fontSize = Math.max(15, Math.min(30, rect.width * 0.022));
    box.style.fontSize = `${fontSize}px`;
  }

  function show(text: string, kind: "partial" | "final" | "status") {
    line.textContent = text;
    box.className = `caption visible ${kind}`;
    reposition();
    window.clearTimeout(clearTimer);
    const shouldAutoHide = kind !== "partial";
    if (shouldAutoHide) {
      clearTimer = window.setTimeout(() => {
        box.className = "caption";
      }, FINAL_HOLD_MS);
    }
  }

  function moveIntoFullscreenElement() {
    const fullscreenElement = document.fullscreenElement;
    if (fullscreenElement && host.parentElement !== fullscreenElement) {
      fullscreenElement.appendChild(host);
      return;
    }
    if (!fullscreenElement && host.parentElement !== document.documentElement) {
      document.documentElement.appendChild(host);
    }
  }

  document.addEventListener("fullscreenchange", () => {
    moveIntoFullscreenElement();
    reposition();
  });
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, { passive: true });
  window.setInterval(reposition, REPOSITION_INTERVAL_MS);

  chrome.runtime.onMessage.addListener((message: CaptionCommand) => {
    switch (message.cmd) {
      case "caption-partial":
        show(message.text, "partial");
        break;
      case "caption-final":
        show(message.translated ?? message.text, "final");
        break;
      case "caption-status":
        show(message.message, "status");
        break;
      case "caption-clear":
        window.clearTimeout(clearTimer);
        box.className = "caption";
        break;
    }
  });

  reposition();
}

const alreadyLoaded = window.__gbmlOverlayLoaded === true;
if (!alreadyLoaded) {
  window.__gbmlOverlayLoaded = true;
  init();
}
