// Item de menu de contexto "Legendar esta aba": é o gesto de invocação que o
// chrome.tabCapture exige — o shell exibe e para a sessão, mas o start nasce
// daqui ou do popup.
import { startCaptions } from "./translator-session";

const MENU_ID = "gbml-legendar-aba";

export function anexarContextMenu(): void {
  chrome.runtime.onInstalled.addListener(criarMenu);
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID || tab?.id === undefined) {
      return;
    }
    void iniciarPelaAba(tab.id);
  });
}

function criarMenu(): void {
  // remove antes de criar: onInstalled roda de novo em update da extensão
  chrome.contextMenus.remove(MENU_ID, () => {
    void chrome.runtime.lastError; // id inexistente na primeira instalação
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "Legendar esta aba (Luna)",
      contexts: ["page", "video", "audio"],
    });
  });
}

async function iniciarPelaAba(tabId: number): Promise<void> {
  const stored = await chrome.storage.local.get([
    "sourceLanguage",
    "targetLanguage",
  ]);
  const sourceLanguage =
    typeof stored.sourceLanguage === "string" ? stored.sourceLanguage : "en-US";
  const targetLanguage =
    typeof stored.targetLanguage === "string" ? stored.targetLanguage : "pt-BR";
  const resultado = await startCaptions(tabId, sourceLanguage, targetLanguage);
  if (!resultado.ok) {
    console.error("start pelo menu de contexto falhou:", resultado.error);
  }
}
