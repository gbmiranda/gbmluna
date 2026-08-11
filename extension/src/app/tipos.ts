// Tipos compartilhados do shell Luna (docs/twoddd.md). As camadas — engine,
// store, ui — conversam por estes contratos e não se importam entre si.

export interface Lente {
  x: number;
  y: number;
  s: number; // escala: px de tela por wu; s ∈ [0.02, 4]
}

export type TipoTile = "site" | "modulo";

export interface TilePlano {
  id: string; // itemKey (site) ou "modulo:<nome>"
  tipo: TipoTile;
  // mundo (wu), canto superior esquerdo
  x: number;
  y: number;
  w: number;
  h: number;
  titulo: string;
  dominio?: string;
  url?: string;
  favicon?: string;
  modulo?: string;
  radar: number; // R(i) ∈ [0,1]
  clusterId?: string;
  ancorado: boolean;
  aberto: boolean; // aberto em alguma aba do Chrome
}

export interface ClusterPlano {
  id: string;
  rotulo: string;
  matiz: number; // 1..7 → --t-hue-n
  x: number;
  y: number;
  itens: string[]; // ids dos tiles
}

export interface LugarPlano {
  id: string;
  nome: string;
  rect: { x: number; y: number; w: number; h: number };
  fixo: boolean; // Deck não se move nem se apaga
}

export const TILE_SITE = { w: 320, h: 200 } as const;
export const TILE_MODULO = { w: 320, h: 400 } as const;
export const DECK_RECT = { x: -600, y: -400, w: 1200, h: 800 } as const;

export const LENTE_MIN = 0.02;
export const LENTE_MAX = 4;
// Bandas de histerese do zoom semântico (entra/sai — docs/twoddd.md)
export const Z0_ENTRA = 0.2;
export const Z0_SAI = 0.24;
export const PALCO_ENTRA = 1.5;
export const PALCO_SAI = 1.3;
