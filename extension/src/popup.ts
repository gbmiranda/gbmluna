import type {
  CaptureStatus,
  CommandResult,
  PingHostResult,
  StartCaptionsCommand,
} from "./protocol";

const toggleButton = document.getElementById("toggle") as HTMLButtonElement;
const pingButton = document.getElementById("ping") as HTMLButtonElement;
const sourceSelect = document.getElementById("source") as HTMLSelectElement;
const targetSelect = document.getElementById("target") as HTMLSelectElement;
const statusText = document.getElementById("status") as HTMLParagraphElement;

let capturing = false;

function renderToggle(): void {
  if (capturing) {
    toggleButton.textContent = "Parar legendas";
    toggleButton.classList.add("stop");
  } else {
    toggleButton.textContent = "Iniciar legendas";
    toggleButton.classList.remove("stop");
  }
}

async function restoreLanguages(): Promise<void> {
  const stored = await chrome.storage.local.get([
    "sourceLanguage",
    "targetLanguage",
  ]);
  if (typeof stored.sourceLanguage === "string") {
    sourceSelect.value = stored.sourceLanguage;
  }
  if (typeof stored.targetLanguage === "string") {
    targetSelect.value = stored.targetLanguage;
  }
}

async function refreshStatus(): Promise<void> {
  const status: CaptureStatus = await chrome.runtime.sendMessage({
    cmd: "get-status",
  });
  capturing = status.capturing;
  if (status.capturing) {
    statusText.textContent = "Legendas ativas.";
  }
  renderToggle();
}

async function startCaptions(): Promise<void> {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!activeTab?.id) {
    statusText.textContent = "Nenhuma aba ativa encontrada.";
    return;
  }

  await chrome.storage.local.set({
    sourceLanguage: sourceSelect.value,
    targetLanguage: targetSelect.value,
  });

  const command: StartCaptionsCommand = {
    cmd: "start-captions",
    tabId: activeTab.id,
    sourceLanguage: sourceSelect.value,
    targetLanguage: targetSelect.value,
  };
  const result: CommandResult = await chrome.runtime.sendMessage(command);
  if (!result.ok) {
    statusText.textContent = `Não deu: ${result.error}`;
    return;
  }
  capturing = true;
  statusText.textContent = "Legendas ativas.";
  renderToggle();
}

async function stopCaptions(): Promise<void> {
  statusText.textContent = "Finalizando…";
  const result: CommandResult = await chrome.runtime.sendMessage({
    cmd: "stop-captions",
  });
  if (!result.ok) {
    statusText.textContent = `Não deu: ${result.error}`;
    return;
  }
  capturing = false;
  statusText.textContent = "Legendas paradas.";
  renderToggle();
}

toggleButton.addEventListener("click", async () => {
  toggleButton.disabled = true;
  if (capturing) {
    await stopCaptions();
  } else {
    await startCaptions();
  }
  toggleButton.disabled = false;
});

pingButton.addEventListener("click", async () => {
  pingButton.disabled = true;
  statusText.textContent = "Conectando ao host…";
  const result: PingHostResult = await chrome.runtime.sendMessage({
    cmd: "ping-host",
  });
  if (result.ok) {
    statusText.textContent = `Host conectado (v${result.hostVersion})`;
  } else {
    statusText.textContent = `Host indisponível: ${result.error}`;
  }
  pingButton.disabled = false;
});

void restoreLanguages().then(refreshStatus);
