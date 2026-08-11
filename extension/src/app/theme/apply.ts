// Aplicação e persistência de tema (docs/design-system.md §2.1):
// Meia-noite é o padrão — a identidade do Luna é o céu noturno; a escolha
// manual persiste em chrome.storage.local e ganha do padrão nas próximas.

import type { TemaDef } from "./tokens";
import { TOKENS_TEMA } from "./tokens";
import { MEIA_NOITE, temaPorId } from "./themes";

const CHAVE_TEMA = "temaId";

// Seta as custom properties no <html> e marca data-tema — CSS e canvas
// (getComputedStyle) leem tudo dali; trocar de tema é idempotente.
export function aplicarTema(tema: TemaDef): void {
  const raiz = document.documentElement;
  for (const token of TOKENS_TEMA) {
    raiz.style.setProperty(token, tema.tokens[token]);
  }
  raiz.dataset.tema = tema.id;
}

// Tema salvo, se houver e ainda existir; senão o que o sistema prefere.
export async function temaInicial(): Promise<TemaDef> {
  try {
    const salvo = await chrome.storage.local.get(CHAVE_TEMA);
    const id: unknown = salvo[CHAVE_TEMA];
    if (typeof id === "string") {
      const tema = temaPorId(id);
      if (tema) return tema;
    }
  } catch {
    // Sem chrome.storage (página aberta fora da extensão) — cai no padrão.
  }
  // A identidade do Luna é o céu noturno: Meia-noite é o padrão sempre;
  // Papel é escolha manual (persistida), não herança do sistema.
  return MEIA_NOITE;
}

export async function salvarTema(id: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [CHAVE_TEMA]: id });
  } catch {
    // Melhor esforço: sem storage o tema só não persiste.
  }
}
