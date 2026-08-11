// Lente: a câmera do Plano (docs/twoddd.md). O #mundo recebe
// `translate3d(-x·s, -y·s, 0) scale(s)` com origem 0 0 — logo {x, y} é o canto
// superior esquerdo do viewport em wu e s converte wu em px de tela. Funções
// puras: quem aplica o resultado é o viewport.
import type { Lente } from "../tipos";
import { LENTE_MAX, LENTE_MIN } from "../tipos";

export interface Ponto {
  x: number;
  y: number;
}

export interface Tamanho {
  w: number;
  h: number;
}

// Retângulo em wu, canto superior esquerdo — mesma convenção de TilePlano.
export interface Retangulo {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Respiro do enquadramento para o conteúdo não colar na borda do viewport.
export const MARGEM_ENQUADRAR = 160; // wu

export function clampLente(lente: Lente): Lente {
  return {
    x: lente.x,
    y: lente.y,
    s: Math.min(LENTE_MAX, Math.max(LENTE_MIN, lente.s)),
  };
}

export function screenToWorld(lente: Lente, ponto: Ponto): Ponto {
  return { x: lente.x + ponto.x / lente.s, y: lente.y + ponto.y / lente.s };
}

export function worldToScreen(lente: Lente, ponto: Ponto): Ponto {
  return { x: (ponto.x - lente.x) * lente.s, y: (ponto.y - lente.y) * lente.s };
}

// Zoom ancorado: o ponto do mundo sob o cursor não pode derivar quando a
// escala muda — resolve-se x' para que ele reprojete no mesmo pixel.
export function zoomAt(lente: Lente, pontoTela: Ponto, fator: number): Lente {
  const s = Math.min(LENTE_MAX, Math.max(LENTE_MIN, lente.s * fator));
  const mundo = screenToWorld(lente, pontoTela);
  return { x: mundo.x - pontoTela.x / s, y: mundo.y - pontoTela.y / s, s };
}

// Lente que centraliza o rect no viewport com margem, na maior escala que
// ainda o contém por inteiro (respeitando os limites da Lente).
export function enquadrar(
  rect: Retangulo,
  viewport: Tamanho,
  margem: number = MARGEM_ENQUADRAR,
): Lente {
  const w = rect.w + margem * 2;
  const h = rect.h + margem * 2;
  const s = Math.min(
    LENTE_MAX,
    Math.max(LENTE_MIN, Math.min(viewport.w / w, viewport.h / h)),
  );
  return {
    x: rect.x + rect.w / 2 - viewport.w / (2 * s),
    y: rect.y + rect.h / 2 - viewport.h / (2 * s),
    s,
  };
}
