// Arquipélago: layout força-dirigida dos centroides de cluster.
// Determinístico por contrato (docs/twoddd.md): ordem fixa de iteração e PRNG
// mulberry32 com seed 42 — mesmo input ⇒ mesmo output, nunca Math.random().
import type { LugarPlano } from "../tipos";

export interface ClusterLayout {
  id: string;
  raio: number; // wu, raio aproximado do girassol do cluster
  lugarId?: string;
}

export const FOLGA_CLUSTER = 100; // wu de respiro entre clusters
const RAIO_ESPIRAL = 620; // wu
const ITERACOES = 300;
const GRAVIDADE = 0.01;
const MOLA_LUGAR = 0.2;

// FNV-1a 32 bits: hash estável entre sessões e devices (idempotência).
export function hashTexto(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function posicionarArquipelago(
  clusters: ClusterLayout[],
  lugares: LugarPlano[],
): Map<string, { x: number; y: number }> {
  const rnd = mulberry32(42);

  // Posição inicial: raio pela ordem, ângulo pelo hash do id — cluster novo
  // não embaralha os existentes (o ângulo é do id, não do índice).
  const posicoes = clusters.map((cluster, k) => {
    const angulo = ((hashTexto(cluster.id) % 360) * Math.PI) / 180;
    const raio = RAIO_ESPIRAL * Math.sqrt(k);
    return { x: raio * Math.cos(angulo), y: raio * Math.sin(angulo) };
  });

  const centrosLugar = new Map<string, { x: number; y: number }>();
  for (const lugar of lugares)
    centrosLugar.set(lugar.id, {
      x: lugar.rect.x + lugar.rect.w / 2,
      y: lugar.rect.y + lugar.rect.h / 2,
    });

  for (let iter = 0; iter < ITERACOES; iter++) {
    // Repulsão par a par em ordem fixa (a < b): sem sobreposição de ilhas.
    for (let a = 0; a < clusters.length; a++) {
      for (let b = a + 1; b < clusters.length; b++) {
        const pa = posicoes[a];
        const pb = posicoes[b];
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const dist = Math.hypot(dx, dy);
        const minimo = clusters[a].raio + clusters[b].raio + FOLGA_CLUSTER;
        if (dist >= minimo) continue;
        let nx: number;
        let ny: number;
        if (dist < 1e-9) {
          // Coincidentes: direção sai do PRNG semeado, nunca de Math.random.
          const angulo = rnd() * 2 * Math.PI;
          nx = Math.cos(angulo);
          ny = Math.sin(angulo);
        } else {
          nx = dx / dist;
          ny = dy / dist;
        }
        const empurrao = (minimo - dist) / 2;
        pa.x -= nx * empurrao;
        pa.y -= ny * empurrao;
        pb.x += nx * empurrao;
        pb.y += ny * empurrao;
      }
    }
    for (let k = 0; k < clusters.length; k++) {
      const p = posicoes[k];
      // Gravidade fraca segura o arquipélago perto da origem (o Deck).
      p.x -= p.x * GRAVIDADE;
      p.y -= p.y * GRAVIDADE;
      const lugarId = clusters[k].lugarId;
      const centro = lugarId ? centrosLugar.get(lugarId) : undefined;
      if (centro) {
        p.x += (centro.x - p.x) * MOLA_LUGAR;
        p.y += (centro.y - p.y) * MOLA_LUGAR;
      }
    }
  }

  const resultado = new Map<string, { x: number; y: number }>();
  for (let k = 0; k < clusters.length; k++)
    resultado.set(clusters[k].id, { x: posicoes[k].x, y: posicoes[k].y });
  return resultado;
}
