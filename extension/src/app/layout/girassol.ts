// Girassol: espiral filotáxica (r = 380·√i, θ = i·137.508°) para os tiles de
// um cluster. O espaçamento de 380 wu garante ausência de sobreposição por
// construção; slots colididos com Âncoras são pulados (a Âncora manda).
// Determinístico: mesma lista ordenada ⇒ mesmas posições.
import type { Retangulo } from "../engine/camera";
import { TILE_MODULO } from "../tipos";

export const RAIO_GIRASSOL = 380; // wu
export const ANGULO_AUREO = 137.508; // graus

// Robustez: um `ocupados` patológico (sempre true) não pode travar o shell.
const MAX_SLOTS_PULADOS = 10000;

export function posicionarGirassol(
  itensOrdenados: string[],
  centro: { x: number; y: number },
  ocupados: (aabb: Retangulo) => boolean,
): Map<string, { x: number; y: number }> {
  const posicoes = new Map<string, { x: number; y: number }>();
  let i = 0;
  let pulados = 0;
  for (const id of itensOrdenados) {
    for (;;) {
      const raio = RAIO_GIRASSOL * Math.sqrt(i);
      const theta = (i * ANGULO_AUREO * Math.PI) / 180;
      // {x, y} é o CENTRO do slot; quem aplica converte para o canto do tile.
      const x = centro.x + raio * Math.cos(theta);
      const y = centro.y + raio * Math.sin(theta);
      i++;
      // Testa com o maior tile (módulo): serve para site e módulo sem
      // precisar saber o tipo de cada id.
      const aabb: Retangulo = {
        x: x - TILE_MODULO.w / 2,
        y: y - TILE_MODULO.h / 2,
        w: TILE_MODULO.w,
        h: TILE_MODULO.h,
      };
      if (!ocupados(aabb) || pulados >= MAX_SLOTS_PULADOS) {
        posicoes.set(id, { x, y });
        break;
      }
      pulados++;
    }
  }
  return posicoes;
}
