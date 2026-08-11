// HUD — canto inferior esquerdo: wordmark, Lua de zoom, zoom% e controles.
// A Lua é informação, nunca decoração: a fase indica a profundidade
// (nova no z0, meia no z1, cheia no Palco) — docs/design-system.md §1.

import type { Lente } from "../tipos";
import { criarBotao, luaSvg, wordmarkSvg } from "./components";

export type NivelZoom = "z0" | "z1" | "palco";

export interface OpcoesHud {
  aoTrocarTema(): void;
  aoIrParaDeck(): void;
}

export interface Hud {
  atualizar(lente: Lente, nivel: NivelZoom): void;
}

const FASE_POR_NIVEL: Record<NivelZoom, 0 | 2 | 4> = { z0: 0, z1: 2, palco: 4 };
const ROTULO_POR_NIVEL: Record<NivelZoom, string> = {
  z0: "constelação",
  z1: "cartões",
  palco: "palco",
};

export function criarHud(raiz: HTMLElement, opcoes: OpcoesHud): Hud {
  const caixa = document.createElement("div");
  caixa.className = "hud";

  const wordmark = document.createElement("span");
  wordmark.className = "hud-wordmark";
  wordmark.innerHTML = wordmarkSvg();

  const lua = document.createElement("span");
  lua.className = "hud-lua";
  lua.innerHTML = luaSvg(FASE_POR_NIVEL.z1);
  lua.title = `Nível: ${ROTULO_POR_NIVEL.z1}`;

  // A mudança de nível é anunciada em texto (aria-live) — nunca só pela fase.
  const anuncio = document.createElement("span");
  anuncio.className = "sr-only";
  anuncio.setAttribute("aria-live", "polite");

  const zoom = document.createElement("span");
  zoom.className = "hud-zoom";
  zoom.textContent = "100%";
  zoom.title = "Zoom";

  const deck = criarBotao("deck", "fantasma", opcoes.aoIrParaDeck);
  deck.setAttribute("aria-label", "Ir para o Deck (Cmd+0)");
  deck.title = "Ir para o Deck (Cmd+0)";

  const tema = criarBotao("tema", "fantasma", opcoes.aoTrocarTema);
  tema.setAttribute("aria-label", "Alternar tema (Meia-noite/Papel)");
  tema.title = "Alternar tema (Meia-noite/Papel)";

  caixa.append(wordmark, lua, anuncio, zoom, deck, tema);
  raiz.append(caixa);

  let nivelAtual: NivelZoom | undefined;
  return {
    atualizar(lente, nivel) {
      zoom.textContent = `${Math.round(lente.s * 100)}%`;
      if (nivel === nivelAtual) return;
      nivelAtual = nivel;
      lua.innerHTML = luaSvg(FASE_POR_NIVEL[nivel]);
      lua.title = `Nível: ${ROTULO_POR_NIVEL[nivel]}`;
      anuncio.textContent = `Nível: ${ROTULO_POR_NIVEL[nivel]}`;
    },
  };
}
