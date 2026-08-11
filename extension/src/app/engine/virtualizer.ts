// Virtualização: só o que está no viewport (+25% de margem, para pan sem
// "pop-in") existe no DOM. Acima de 250 montados o excedente degrada para
// modo ponto — orçamento de cartões do docs/twoddd.md.
import type { Lente } from "../tipos";
import type { Retangulo, Tamanho } from "./camera";
import type { IndiceEspacial } from "./spatial-index";

export const LIMITE_MONTADOS = 250;
const MARGEM_VIEWPORT = 0.25;

export interface ConfigVirtualizer {
  indice: IndiceEspacial;
  montar(id: string): void;
  desmontar(id: string): void;
  degradar?(ids: string[]): void;
}

export interface Virtualizer {
  aoLente(lente: Lente, viewport: Tamanho): void;
  montados(): ReadonlySet<string>;
  limpar(): void;
}

export function criarVirtualizer(config: ConfigVirtualizer): Virtualizer {
  const montados = new Set<string>();

  function aoLente(lente: Lente, viewport: Tamanho): void {
    const w = viewport.w / lente.s;
    const h = viewport.h / lente.s;
    const area: Retangulo = {
      x: lente.x - (w * MARGEM_VIEWPORT) / 2,
      y: lente.y - (h * MARGEM_VIEWPORT) / 2,
      w: w * (1 + MARGEM_VIEWPORT),
      h: h * (1 + MARGEM_VIEWPORT),
    };
    let alvo = config.indice.consultar(area);
    if (alvo.length > LIMITE_MONTADOS) {
      // Estourou o orçamento: ficam os mais próximos do centro do viewport;
      // desempate por id mantém o resultado determinístico.
      const cx = lente.x + w / 2;
      const cy = lente.y + h / 2;
      const porDistancia = alvo
        .map((id) => {
          const aabb = config.indice.aabbDe(id);
          const dx = aabb ? aabb.x + aabb.w / 2 - cx : 0;
          const dy = aabb ? aabb.y + aabb.h / 2 - cy : 0;
          return { id, dist: dx * dx + dy * dy };
        })
        .sort((a, b) => a.dist - b.dist || (a.id < b.id ? -1 : 1));
      alvo = porDistancia.slice(0, LIMITE_MONTADOS).map((e) => e.id);
      const excedente = porDistancia.slice(LIMITE_MONTADOS).map((e) => e.id);
      config.degradar?.(excedente);
    }
    const alvoSet = new Set(alvo);
    for (const id of [...montados]) {
      if (!alvoSet.has(id)) {
        montados.delete(id);
        config.desmontar(id);
      }
    }
    for (const id of alvo) {
      if (!montados.has(id)) {
        montados.add(id);
        config.montar(id);
      }
    }
  }

  function limpar(): void {
    for (const id of [...montados]) {
      montados.delete(id);
      config.desmontar(id);
    }
  }

  return { aoLente, montados: () => montados, limpar };
}
