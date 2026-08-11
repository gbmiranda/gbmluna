// Abertura idempotente do shell Luna: se já existe uma aba do app, foca a
// janela e a aba em vez de criar outra (3 cliques = 1 janela).
const APP_PATH = "app.html";

export async function abrirShell(): Promise<void> {
  const url = chrome.runtime.getURL(APP_PATH);
  const abas = await chrome.tabs.query({ url });
  const existente = abas[0];
  if (existente?.id !== undefined) {
    if (existente.windowId !== undefined) {
      await chrome.windows.update(existente.windowId, { focused: true });
    }
    await chrome.tabs.update(existente.id, { active: true });
    return;
  }
  await chrome.tabs.create({ url });
}
