// Atlas v1 — clustering heurístico e determinístico (docs/twoddd.md § Atlas):
// mesmo input ⇒ mesmos clusters, ids e ordem. Nada daqui é persistido —
// cluster é estado derivável, recomputado a cada coleta (regra de ouro).

import type { ClusterPlano } from "../tipos";
import type { ItemColetado } from "./sources";

const MIN_ITENS_CLUSTER = 3;
const CLUSTER_DIVERSOS = "diversos";
const MAX_CHARS_ROTULO = 18;

export function agrupar(
  itens: ItemColetado[],
  radar: Map<string, number>,
): { clusters: ClusterPlano[]; itemCluster: Map<string, string> } {
  const porRaiz = new Map<string, ItemColetado[]>();
  for (const item of itens) {
    const raiz = dominioRaiz(item.dominio);
    const grupo = porRaiz.get(raiz);
    if (grupo) grupo.push(item);
    else porRaiz.set(raiz, [item]);
  }

  const clusters: ClusterPlano[] = [];
  const itemCluster = new Map<string, string>();
  const diversos: ItemColetado[] = [];

  // Ordem alfabética de domínio: independe da ordem de coleta (determinismo).
  const raizes = [...porRaiz.keys()].sort();
  for (const raiz of raizes) {
    const doDominio = porRaiz.get(raiz)!;
    // Domínio com pouca massa não merece ilha própria — vai para "Diversos".
    if (doDominio.length < MIN_ITENS_CLUSTER) {
      diversos.push(...doDominio);
      continue;
    }
    const id = `dom:${raiz}`;
    clusters.push({
      id,
      rotulo: marcaDoDominio(raiz),
      matiz: matizDe(id),
      // Posição é estado derivável: o layout (arquipélago) preenche depois.
      x: 0,
      y: 0,
      itens: ordenarPorRadar(doDominio, radar).map((i) => i.itemKey),
    });
    for (const item of doDominio) itemCluster.set(item.itemKey, id);
  }

  if (diversos.length > 0) {
    clusters.push({
      id: CLUSTER_DIVERSOS,
      rotulo: "Diversos",
      matiz: matizDe(CLUSTER_DIVERSOS),
      x: 0,
      y: 0,
      itens: ordenarPorRadar(diversos, radar).map((i) => i.itemKey),
    });
    for (const item of diversos)
      itemCluster.set(item.itemKey, CLUSTER_DIVERSOS);
  }

  return { clusters, itemCluster };
}

// Domínio raiz sem lib de PSL: penúltimo label; se ele é curto (≤ 3 chars,
// ex.: "com" em .com.br, "co" em .co.uk) é sufixo composto e a raiz inclui o
// antepenúltimo. Heurística — erra em casos exóticos, e tudo bem na v1.
export function dominioRaiz(hostname: string): string {
  const labels = hostname
    .toLowerCase()
    .split(".")
    .filter((l) => l.length > 0);
  if (labels.length <= 2) return labels.join(".");
  const penultimo = labels[labels.length - 2];
  const tamanho = penultimo.length <= 3 ? 3 : 2;
  return labels.slice(-tamanho).join(".");
}

// Marca = parte registrável sem TLD, capitalizada ("youtube.com" → "Youtube").
export function marcaDoDominio(raiz: string): string {
  const marca = raiz.split(".")[0] ?? raiz;
  return capitalizar(marca);
}

// Ordena por Radar decrescente; empate quebra por itemKey para a ordem ser
// estável entre recomputações.
function ordenarPorRadar(
  itens: ItemColetado[],
  radar: Map<string, number>,
): ItemColetado[] {
  return [...itens].sort((a, b) => {
    const delta = (radar.get(b.itemKey) ?? 0) - (radar.get(a.itemKey) ?? 0);
    if (delta !== 0) return delta;
    return a.itemKey < b.itemKey ? -1 : 1;
  });
}

// Matiz 1..7 → tokens --t-hue-n do tema; hash do id para a cor de um cluster
// sobreviver a recomputações (mesmo id ⇒ mesma cor).
function matizDe(clusterId: string): number {
  return 1 + (hashSimples(clusterId) % 7);
}

// djb2 (xor-free): suficiente para espalhar 7 matizes, sem dependência.
function hashSimples(texto: string): number {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) {
    h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
  }
  return h;
}

// ---------------------------------------------------------------------------
// TF-IDF de títulos — reserva para subdividir o "Diversos" (o agrupar v1 usa
// marca de domínio). Uma entrada por cluster (seus títulos), um rótulo por
// cluster na mesma ordem.

// Stopwords curtas pt+en: só o que mais polui título de página.
const STOPWORDS = new Set([
  // pt
  "a",
  "o",
  "as",
  "os",
  "um",
  "uma",
  "de",
  "do",
  "da",
  "dos",
  "das",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "por",
  "para",
  "com",
  "sem",
  "que",
  "e",
  "ou",
  "ao",
  "aos",
  "se",
  "seu",
  "sua",
  "como",
  "mais",
  "nao",
  "não",
  // en
  "the",
  "an",
  "of",
  "to",
  "in",
  "on",
  "for",
  "and",
  "or",
  "with",
  "at",
  "by",
  "from",
  "is",
  "are",
  "was",
  "be",
  "as",
  "that",
  "this",
  "it",
  "you",
  "your",
  "how",
  "what",
  "new",
]);

export function rotularTfIdf(titulos: string[][]): string[] {
  const docs = titulos.map(termosDoCluster);
  const n = docs.length;

  // df: em quantos clusters cada termo aparece — termo onipresente vale pouco.
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const termo of doc.keys()) df.set(termo, (df.get(termo) ?? 0) + 1);
  }

  return docs.map((doc) => {
    let melhor = "";
    let melhorPontos = 0;
    for (const [termo, info] of doc) {
      if (termo.length > MAX_CHARS_ROTULO) continue;
      const idf = Math.log(1 + n / (df.get(termo) ?? 1));
      // Bigrama carrega mais contexto que unigrama de peso igual.
      const pontos = info.tf * idf * (info.bigrama ? 1.2 : 1);
      if (
        pontos > melhorPontos ||
        (pontos === melhorPontos && melhor !== "" && termo < melhor)
      ) {
        melhor = termo;
        melhorPontos = pontos;
      }
    }
    return melhor === "" ? "Diversos" : capitalizar(melhor);
  });
}

interface InfoTermo {
  tf: number;
  bigrama: boolean;
}

function termosDoCluster(titulosDoCluster: string[]): Map<string, InfoTermo> {
  const termos = new Map<string, InfoTermo>();
  const somar = (termo: string, bigrama: boolean): void => {
    const info = termos.get(termo);
    if (info) info.tf += 1;
    else termos.set(termo, { tf: 1, bigrama });
  };
  for (const titulo of titulosDoCluster) {
    const tokens = tokenizar(titulo);
    for (const token of tokens) somar(token, false);
    // Bigramas só dentro do mesmo título — atravessar títulos criaria pares falsos.
    for (let i = 0; i + 1 < tokens.length; i++) {
      somar(`${tokens[i]} ${tokens[i + 1]}`, true);
    }
  }
  return termos;
}

function tokenizar(titulo: string): string[] {
  return titulo
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function capitalizar(texto: string): string {
  return texto.replace(/(^|\s)\p{L}/gu, (letra) => letra.toUpperCase());
}
