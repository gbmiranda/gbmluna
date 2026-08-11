// Temas embutidos do Luna — Meia-noite (dark) e Papel (light), com os valores
// exatos da tabela do docs/design-system.md §2.1. Este é o ÚNICO arquivo do
// front onde hex literal é permitido.

import type { TemaDef, TokenMatiz } from "./tokens";

// Matizes de cluster (--t-hue-1..7): 7 cores geradas em OKLCH a partir do
// accent do tema. Fórmula: hue(n) = hAccent + (n−1)·(360/7), com L e C fixos
// nos do accent — OKLCH é perceptualmente uniforme, então manter L/C e girar
// só o matiz dá 7 clusters com o mesmo "peso" visual, e o hue-1 é o próprio
// accent (a brasa ancora a paleta).
function matizesOklch(
  l: number,
  c: number,
  hAccent: number,
): Record<TokenMatiz, string> {
  const passo = 360 / 7;
  const cor = (n: number): string => {
    const h = (hAccent + (n - 1) * passo) % 360;
    return `oklch(${l} ${c} ${h.toFixed(1)})`;
  };
  return {
    "--t-hue-1": cor(1),
    "--t-hue-2": cor(2),
    "--t-hue-3": cor(3),
    "--t-hue-4": cor(4),
    "--t-hue-5": cor(5),
    "--t-hue-6": cor(6),
    "--t-hue-7": cor(7),
  };
}

export const MEIA_NOITE: TemaDef = {
  id: "meia-noite",
  nome: "Meia-noite",
  tipo: "dark",
  builtIn: true,
  tokens: {
    "--t-bg-canvas": "#0b0e14",
    "--t-bg-surface": "#131722",
    "--t-bg-raised": "#1a2030",
    "--t-fg": "#e2e8f0",
    "--t-fg-muted": "#8b93a7",
    "--t-accent": "#d97757",
    "--t-accent-fg": "#0b0e14",
    "--t-moon": "#aeb9d6",
    "--t-border": "#2a3040",
    "--t-shadow": "#000000",
    "--t-sel-bg": "#d9775740",
    "--t-ok": "#7dc87d",
    "--t-warn": "#e5c07b",
    "--t-err": "#e06c75",
    // #d97757 em OKLCH ≈ (0.672, 0.131, 38.8°)
    ...matizesOklch(0.672, 0.131, 38.8),
  },
};

export const PAPEL: TemaDef = {
  id: "papel",
  nome: "Papel",
  tipo: "light",
  builtIn: true,
  tokens: {
    "--t-bg-canvas": "#f4f4f2",
    "--t-bg-surface": "#ffffff",
    "--t-bg-raised": "#eceae6",
    "--t-fg": "#1a1d23",
    "--t-fg-muted": "#6b7280",
    "--t-accent": "#c15f3c",
    "--t-accent-fg": "#ffffff",
    "--t-moon": "#7c8db0",
    "--t-border": "#d6d3cd",
    "--t-shadow": "#c9c5bd",
    "--t-sel-bg": "#c15f3c26",
    // Análogos claros dos estados: mesmos matizes do Meia-noite, escurecidos
    // para manter AA sobre superfícies claras (o DS pede "análogos").
    "--t-ok": "#3e7c3e",
    "--t-warn": "#8a6d1a",
    "--t-err": "#b3404a",
    // #c15f3c em OKLCH ≈ (0.597, 0.135, 39.9°)
    ...matizesOklch(0.597, 0.135, 39.9),
  },
};

export const TEMAS_EMBUTIDOS: readonly TemaDef[] = [MEIA_NOITE, PAPEL];

export function temaPorId(id: string): TemaDef | undefined {
  return TEMAS_EMBUTIDOS.find((tema) => tema.id === id);
}
