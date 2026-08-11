// Grid hash espacial (célula 1024 wu): consulta de viewport em O(células
// visíveis), não O(tiles totais) — pré-requisito da virtualização a 60 fps.
import type { Retangulo } from "./camera";

export const CELULA_WU = 1024;

export interface IndiceEspacial {
  inserir(id: string, aabb: Retangulo): void;
  atualizar(id: string, aabb: Retangulo): void;
  remover(id: string): void;
  consultar(aabb: Retangulo): string[];
  aabbDe(id: string): Retangulo | undefined;
}

function intersecta(a: Retangulo, b: Retangulo): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export function criarIndiceEspacial(): IndiceEspacial {
  const celulas = new Map<string, Set<string>>();
  const itens = new Map<string, { aabb: Retangulo; chaves: string[] }>();

  function chavesDe(aabb: Retangulo): string[] {
    const chaves: string[] = [];
    const x0 = Math.floor(aabb.x / CELULA_WU);
    const y0 = Math.floor(aabb.y / CELULA_WU);
    const x1 = Math.floor((aabb.x + aabb.w) / CELULA_WU);
    const y1 = Math.floor((aabb.y + aabb.h) / CELULA_WU);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) chaves.push(`${cx}:${cy}`);
    return chaves;
  }

  function remover(id: string): void {
    const item = itens.get(id);
    if (!item) return; // remover o inexistente é no-op (idempotência)
    for (const chave of item.chaves) {
      const celula = celulas.get(chave);
      if (!celula) continue;
      celula.delete(id);
      if (celula.size === 0) celulas.delete(chave);
    }
    itens.delete(id);
  }

  function inserir(id: string, aabb: Retangulo): void {
    remover(id); // inserir repetido é upsert, nunca duplica
    const chaves = chavesDe(aabb);
    itens.set(id, { aabb: { ...aabb }, chaves });
    for (const chave of chaves) {
      let celula = celulas.get(chave);
      if (!celula) {
        celula = new Set();
        celulas.set(chave, celula);
      }
      celula.add(id);
    }
  }

  function consultar(aabb: Retangulo): string[] {
    const resultado: string[] = [];
    const vistos = new Set<string>();
    for (const chave of chavesDe(aabb)) {
      const celula = celulas.get(chave);
      if (!celula) continue;
      for (const id of celula) {
        if (vistos.has(id)) continue;
        vistos.add(id);
        const item = itens.get(id);
        // a célula é grosseira; o AABB real decide
        if (item && intersecta(item.aabb, aabb)) resultado.push(id);
      }
    }
    return resultado;
  }

  return {
    inserir,
    atualizar: inserir,
    remover,
    consultar,
    aabbDe: (id) => itens.get(id)?.aabb,
  };
}
