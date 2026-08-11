// Schema v1 da persistência do Luna (docs/twoddd.md § Persistência).
// Regra de ouro: só entra aqui o que NÃO é derivável — itens conhecidos,
// âncoras, Lugares, prefs. Clusters, posições automáticas e vetores são
// recomputáveis e nunca viram verdade persistida.

export const SCHEMA_VERSION = 1;

// Nomes dos object stores (fonte única — db.ts e ops.ts usam estes consts).
export const STORE_ITENS = "itens";
export const STORE_ANCORAS = "ancoras";
export const STORE_LUGARES = "lugares";
export const STORE_PREFS = "prefs";
export const STORE_OPLOG = "oplog";

// Campos comuns de todo registro persistido. `rev` + `updatedAt` + `deviceId`
// permitem LWW no sync futuro; `deletedAt` é tombstone (deleção convergente).
export interface Persisted {
  id: string;
  createdAt: number;
  updatedAt: number;
  rev: number;
  deviceId: string;
  deletedAt?: number;
}

export type EmbedMode = "card" | "iframe" | "tab-only";

export interface ItemConhecido extends Persisted {
  itemKey: string; // sha256 da URL canônica — estável entre devices
  url: string;
  titulo: string;
  visitas: number;
  ultimaVisita: number;
  embedMode: EmbedMode;
}

export interface Ancora extends Persisted {
  itemKey: string;
  x: number; // wu
  y: number; // wu
  lugarId?: string;
}

export interface LugarPersistido extends Persisted {
  nome: string;
  cor: string;
  rect: { x: number; y: number; w: number; h: number };
  regra?: { dominios?: string[] };
  fixo: boolean; // Deck: não se move nem se apaga
}

export interface TemaEscolhido {
  temaId: string;
}

// Payloads por tipo de op. `id` dos registros é estável (itemKey para itens e
// âncoras) para que reaplicar a mesma op seja upsert, nunca duplicação.
export interface PayloadUpsertItem {
  itemKey: string;
  url: string;
  titulo: string;
  visitas: number;
  ultimaVisita: number;
  embedMode?: EmbedMode;
}

export interface PayloadAncorar {
  itemKey: string;
  x: number;
  y: number;
  lugarId?: string;
}

export interface PayloadSoltarAncora {
  itemKey: string;
}

export interface PayloadUpsertLugar {
  id: string;
  nome: string;
  cor: string;
  rect: { x: number; y: number; w: number; h: number };
  regra?: { dominios?: string[] };
  fixo: boolean;
}

export interface PayloadRemoverLugar {
  id: string;
}

export interface PayloadDefinirTema {
  temaId: string;
}

export interface PayloadDefinirEmbedMode {
  itemKey: string;
  embedMode: EmbedMode;
}

interface OpBase {
  opId: string; // uuid — chave da janela de dedupe no oplog
  at: number; // epoch ms; vira updatedAt do registro afetado
}

// União discriminada por `op`: aplicarOp() enxerga o payload certo por caso,
// sem cast — toda escrita passa por aqui (porta única).
export type StoreOp =
  | (OpBase & { op: "upsert-item"; payload: PayloadUpsertItem })
  | (OpBase & { op: "ancorar"; payload: PayloadAncorar })
  | (OpBase & { op: "soltar-ancora"; payload: PayloadSoltarAncora })
  | (OpBase & { op: "upsert-lugar"; payload: PayloadUpsertLugar })
  | (OpBase & { op: "remover-lugar"; payload: PayloadRemoverLugar })
  | (OpBase & { op: "definir-tema"; payload: PayloadDefinirTema })
  | (OpBase & { op: "definir-embed-mode"; payload: PayloadDefinirEmbedMode });

export type TipoOp = StoreOp["op"];
