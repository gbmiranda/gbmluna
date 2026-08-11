// Radar: score contínuo de relevância contextual R(i) ∈ [0,1]
// (docs/twoddd.md § Atlas e Radar). Derivável por definição — recalculado a
// cada coleta, nunca persistido.
//
//   R = 0.30·F + 0.25·Rec + 0.20·H + 0.15·S + 0.10·A
//
//   F   frequência log-normalizada: log(1+visitas) / log(1+maxVisitas)
//   Rec recência com meia-vida de 72 h: 2^(−Δh/72), Δh = horas desde a última visita
//   H   hábito (histograma 7×24) — v1 sem dado: neutro 0.3
//   S   sessão — v1: 1 se o domínio do item apareceu nas abas ativadas nos
//       últimos 30 min, senão 0 (com intel vira cosseno de embedding)
//   A   1 se o item está aberto em alguma aba

import type { ItemColetado } from "./sources";

const JANELA_SESSAO_MS = 30 * 60 * 1000;
const MEIA_VIDA_HORAS = 72;
const HABITO_NEUTRO = 0.3; // sem histograma ainda, nem premia nem pune

export function calcularRadar(
  itens: ItemColetado[],
  abasRecentes: { dominio: string; quando: number }[],
): Map<string, number> {
  const agora = Date.now();

  // Normalizador de F: sem itens (ou sem visitas) o termo inteiro zera.
  let maxVisitas = 0;
  for (const item of itens) maxVisitas = Math.max(maxVisitas, item.visitas);
  const logMax = Math.log(1 + maxVisitas);

  const dominiosDaSessao = new Set<string>();
  for (const aba of abasRecentes) {
    if (agora - aba.quando <= JANELA_SESSAO_MS)
      dominiosDaSessao.add(aba.dominio);
  }

  const radar = new Map<string, number>();
  for (const item of itens) {
    const f = logMax > 0 ? Math.log(1 + item.visitas) / logMax : 0;
    // ultimaVisita 0 = data desconhecida (ex.: topSites) → recência zero.
    const rec =
      item.ultimaVisita > 0
        ? Math.pow(
            2,
            -((agora - item.ultimaVisita) / 3_600_000) / MEIA_VIDA_HORAS,
          )
        : 0;
    const s = dominiosDaSessao.has(item.dominio) ? 1 : 0;
    const a = item.aberto ? 1 : 0;
    radar.set(
      item.itemKey,
      0.3 * f + 0.25 * rec + 0.2 * HABITO_NEUTRO + 0.15 * s + 0.1 * a,
    );
  }
  return radar;
}
