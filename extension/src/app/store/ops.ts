// Porta ÚNICA de escrita do store (docs/twoddd.md § Persistência): toda
// mutação vira uma StoreOp com opId. Reaplicar a mesma op é no-op (janela de
// dedupe no oplog) — é isso que torna retry, replay entre abas e o sync futuro
// seguros sem retrabalho.

import type {
  Ancora,
  ItemConhecido,
  LugarPersistido,
  PayloadAncorar,
  PayloadDefinirEmbedMode,
  PayloadSoltarAncora,
  PayloadUpsertItem,
  PayloadUpsertLugar,
  Persisted,
  StoreOp,
  TemaEscolhido,
} from "./schema";
import {
  STORE_ANCORAS,
  STORE_ITENS,
  STORE_LUGARES,
  STORE_OPLOG,
  STORE_PREFS,
} from "./schema";
import { dbGet, dbPut, podarOplog } from "./db";

// Canal que converge as instâncias abertas (app, popup, SW): quem aplica uma
// op avisa {opId}; as outras recarregam o que precisarem.
export const CANAL_STORE = "gbml-store";

export const PREF_DEVICE_ID = "deviceId";
export const PREF_TEMA = "tema";

interface PrefRegistro<T> {
  chave: string;
  valor: T;
}

let deviceIdPromessa: Promise<string> | undefined;

// uuid gerado uma vez por instalação e guardado em prefs — desempata o LWW do
// sync. Promise cacheada: chamadas concorrentes não geram dois ids.
export function obterDeviceId(): Promise<string> {
  if (!deviceIdPromessa) deviceIdPromessa = carregarDeviceId();
  return deviceIdPromessa;
}

async function carregarDeviceId(): Promise<string> {
  const pref = await dbGet<PrefRegistro<string>>(STORE_PREFS, PREF_DEVICE_ID);
  if (pref) return pref.valor;
  const novo = crypto.randomUUID();
  await dbPut(STORE_PREFS, { chave: PREF_DEVICE_ID, valor: novo });
  return novo;
}

// Fábrica de ops: quem muta nunca inventa opId/at à mão — evita colisão e
// garante o formato que o oplog deduplica.
export function criarOp<O extends StoreOp["op"]>(
  op: O,
  payload: Extract<StoreOp, { op: O }>["payload"],
): Extract<StoreOp, { op: O }> {
  // Cast: TS não correlaciona op↔payload através do genérico na união.
  return {
    opId: crypto.randomUUID(),
    at: Date.now(),
    op,
    payload,
  } as Extract<StoreOp, { op: O }>;
}

// Aplica uma op. Retorna false se o opId já passou por aqui (no-op).
export async function aplicarOp(op: StoreOp): Promise<boolean> {
  const jaAplicada = await dbGet<{ opId: string }>(STORE_OPLOG, op.opId);
  if (jaAplicada) return false;

  const deviceId = await obterDeviceId();
  switch (op.op) {
    case "upsert-item":
      await upsertItem(op.payload, op.at, deviceId);
      break;
    case "ancorar":
      await ancorar(op.payload, op.at, deviceId);
      break;
    case "soltar-ancora":
      await soltarAncora(op.payload, op.at, deviceId);
      break;
    case "upsert-lugar":
      await upsertLugar(op.payload, op.at, deviceId);
      break;
    case "remover-lugar":
      await removerLugar(op.payload.id, op.at, deviceId);
      break;
    case "definir-tema": {
      const tema: TemaEscolhido = { temaId: op.payload.temaId };
      await dbPut(STORE_PREFS, { chave: PREF_TEMA, valor: tema });
      break;
    }
    case "definir-embed-mode":
      await definirEmbedMode(op.payload, op.at, deviceId);
      break;
  }

  // Registrar o opId por último: se algo acima falhar, o retry reaplica tudo
  // (as mutações são upserts idempotentes, então repetir não duplica).
  await dbPut(STORE_OPLOG, { opId: op.opId, at: op.at });
  await podarOplog();
  publicar(op.opId);
  return true;
}

// Escuta ops aplicadas por OUTRAS instâncias (o canal não ecoa para quem
// posta). Retorna a função que desliga a escuta.
export function ouvirOps(callback: (opId: string) => void): () => void {
  const canal = new BroadcastChannel(CANAL_STORE);
  canal.onmessage = (evento) => {
    const dado = evento.data as { opId?: unknown } | null;
    if (dado && typeof dado.opId === "string") callback(dado.opId);
  };
  return () => canal.close();
}

let canalPublicacao: BroadcastChannel | undefined;

function publicar(opId: string): void {
  if (!canalPublicacao) canalPublicacao = new BroadcastChannel(CANAL_STORE);
  canalPublicacao.postMessage({ opId });
}

// LWW local: op mais velha que o registro não regride estado que uma op mais
// nova já escreveu (mesma regra que o sync da nuvem usará).
function perdePorLww(existente: Persisted | undefined, at: number): boolean {
  return existente !== undefined && existente.updatedAt > at;
}

async function upsertItem(
  p: PayloadUpsertItem,
  at: number,
  deviceId: string,
): Promise<void> {
  const existente = await dbGet<ItemConhecido>(STORE_ITENS, p.itemKey);
  if (perdePorLww(existente, at)) return;
  const item: ItemConhecido = {
    // id estável = itemKey: reaplicar é upsert, nunca duplica; e o objeto novo
    // não carrega deletedAt — upsert revive tombstone.
    id: p.itemKey,
    itemKey: p.itemKey,
    url: p.url,
    titulo: p.titulo,
    visitas: p.visitas,
    ultimaVisita: p.ultimaVisita,
    embedMode: p.embedMode ?? existente?.embedMode ?? "card",
    createdAt: existente?.createdAt ?? at,
    updatedAt: at,
    rev: (existente?.rev ?? 0) + 1,
    deviceId,
  };
  await dbPut(STORE_ITENS, item);
}

async function ancorar(
  p: PayloadAncorar,
  at: number,
  deviceId: string,
): Promise<void> {
  const existente = await dbGet<Ancora>(STORE_ANCORAS, p.itemKey);
  if (perdePorLww(existente, at)) return;
  const ancora: Ancora = {
    id: p.itemKey, // uma âncora por item (índice itemKey único)
    itemKey: p.itemKey,
    x: p.x,
    y: p.y,
    createdAt: existente?.createdAt ?? at,
    updatedAt: at,
    rev: (existente?.rev ?? 0) + 1,
    deviceId,
  };
  if (p.lugarId !== undefined) ancora.lugarId = p.lugarId;
  await dbPut(STORE_ANCORAS, ancora);
}

async function soltarAncora(
  p: PayloadSoltarAncora,
  at: number,
  deviceId: string,
): Promise<void> {
  const existente = await dbGet<Ancora>(STORE_ANCORAS, p.itemKey);
  // Soltar o que não existe (ou já foi solto) é sucesso — operação repetível.
  if (!existente || existente.deletedAt !== undefined) return;
  if (perdePorLww(existente, at)) return;
  const tombstone: Ancora = {
    ...existente,
    deletedAt: at, // tombstone: deleção converge entre devices, nunca apaga o registro
    updatedAt: at,
    rev: existente.rev + 1,
    deviceId,
  };
  await dbPut(STORE_ANCORAS, tombstone);
}

async function upsertLugar(
  p: PayloadUpsertLugar,
  at: number,
  deviceId: string,
): Promise<void> {
  const existente = await dbGet<LugarPersistido>(STORE_LUGARES, p.id);
  if (perdePorLww(existente, at)) return;
  const lugar: LugarPersistido = {
    id: p.id,
    nome: p.nome,
    cor: p.cor,
    rect: p.rect,
    fixo: p.fixo,
    createdAt: existente?.createdAt ?? at,
    updatedAt: at,
    rev: (existente?.rev ?? 0) + 1,
    deviceId,
  };
  if (p.regra !== undefined) lugar.regra = p.regra;
  await dbPut(STORE_LUGARES, lugar);
}

async function removerLugar(
  id: string,
  at: number,
  deviceId: string,
): Promise<void> {
  const existente = await dbGet<LugarPersistido>(STORE_LUGARES, id);
  if (!existente || existente.deletedAt !== undefined) return;
  if (existente.fixo) return; // Deck não se apaga (tipos.ts)
  if (perdePorLww(existente, at)) return;
  const tombstone: LugarPersistido = {
    ...existente,
    deletedAt: at,
    updatedAt: at,
    rev: existente.rev + 1,
    deviceId,
  };
  await dbPut(STORE_LUGARES, tombstone);
}

async function definirEmbedMode(
  p: PayloadDefinirEmbedMode,
  at: number,
  deviceId: string,
): Promise<void> {
  const existente = await dbGet<ItemConhecido>(STORE_ITENS, p.itemKey);
  // embedMode só faz sentido sobre item conhecido; sem item, degrada em no-op.
  if (!existente || perdePorLww(existente, at)) return;
  const item: ItemConhecido = {
    ...existente,
    embedMode: p.embedMode,
    updatedAt: at,
    rev: existente.rev + 1,
    deviceId,
  };
  await dbPut(STORE_ITENS, item);
}
