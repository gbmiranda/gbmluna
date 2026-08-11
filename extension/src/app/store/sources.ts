// Coleta das fontes do Atlas v1 (docs/twoddd.md § Atlas e Radar): topSites e
// abas sempre; histórico só com a permissão opcional concedida — permissão
// ausente degrada, nunca lança (CLAUDE.md § Segurança/Robustez).

export interface ItemColetado {
  itemKey: string;
  url: string;
  urlCanonica: string;
  titulo: string;
  dominio: string;
  visitas: number;
  ultimaVisita: number;
  aberto: boolean;
}

const JANELA_HISTORICO_MS = 90 * 24 * 60 * 60 * 1000; // 90 dias
const MAX_HISTORICO = 5000;

// Params de rastreamento não mudam o conteúdo da página: removê-los faz a
// mesma página visitada por caminhos diferentes convergir num itemKey só.
const PARAMS_RASTREAMENTO = new Set(["gclid", "fbclid"]);

interface Bruto {
  url: string;
  titulo: string;
  visitas: number;
  ultimaVisita: number;
  aberto: boolean;
}

export async function coletar(): Promise<ItemColetado[]> {
  const brutos: Bruto[] = [];

  // topSites não expõe contagem: vale como 1 visita de presença, sem data.
  try {
    for (const site of await chrome.topSites.get()) {
      brutos.push({
        url: site.url,
        titulo: site.title,
        visitas: 1,
        ultimaVisita: 0,
        aberto: false,
      });
    }
  } catch {
    // sem permissão topSites → segue com as outras fontes
  }

  try {
    for (const aba of await chrome.tabs.query({})) {
      if (!aba.url) continue;
      brutos.push({
        url: aba.url,
        titulo: aba.title ?? "",
        visitas: 1,
        ultimaVisita: aba.lastAccessed ?? Date.now(),
        aberto: true,
      });
    }
  } catch {
    // sem permissão tabs → segue só com o resto
  }

  try {
    // Só consulta se a permissão opcional já foi concedida — nunca pede aqui
    // (pedir exige gesto do usuário; ver pedirHistorico).
    if (await chrome.permissions.contains({ permissions: ["history"] })) {
      const visitados = await chrome.history.search({
        text: "",
        startTime: Date.now() - JANELA_HISTORICO_MS,
        maxResults: MAX_HISTORICO,
      });
      for (const visita of visitados) {
        if (!visita.url) continue;
        brutos.push({
          url: visita.url,
          titulo: visita.title ?? "",
          visitas: visita.visitCount ?? 1,
          ultimaVisita: visita.lastVisitTime ?? 0,
          aberto: false,
        });
      }
    }
  } catch {
    // histórico indisponível → topSites+tabs bastam
  }

  return deduplicar(brutos);
}

// Funde os brutos por URL canônica (barato) e só então calcula o sha256 de
// cada canônica única — evita hashear 5.000 entradas repetidas.
async function deduplicar(brutos: Bruto[]): Promise<ItemColetado[]> {
  const porCanonica = new Map<string, Omit<ItemColetado, "itemKey">>();
  for (const bruto of brutos) {
    const urlCanonica = canonizarUrl(bruto.url);
    if (!urlCanonica) continue;
    const atual = porCanonica.get(urlCanonica);
    if (!atual) {
      porCanonica.set(urlCanonica, {
        url: bruto.url,
        urlCanonica,
        titulo: bruto.titulo,
        dominio: new URL(urlCanonica).hostname,
        visitas: bruto.visitas,
        ultimaVisita: bruto.ultimaVisita,
        aberto: bruto.aberto,
      });
    } else {
      atual.visitas += bruto.visitas;
      atual.ultimaVisita = Math.max(atual.ultimaVisita, bruto.ultimaVisita);
      atual.aberto = atual.aberto || bruto.aberto;
      if (!atual.titulo && bruto.titulo) atual.titulo = bruto.titulo;
    }
  }
  return Promise.all(
    [...porCanonica.values()].map(async (parcial) => ({
      itemKey: await chaveDeItem(parcial.urlCanonica),
      ...parcial,
    })),
  );
}

// URL canônica: host minúsculo, origin + pathname sem barra final, query sem
// utm_*/gclid/fbclid, sem fragmento. Retorna undefined para o que não é
// site (chrome://, about:, extensões) — isso não vira tile.
export function canonizarUrl(url: string): string | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
  // URL() já normaliza o host para minúsculas.
  const caminho = u.pathname.endsWith("/")
    ? u.pathname.slice(0, -1)
    : u.pathname;
  const params = new URLSearchParams();
  for (const [chave, valor] of u.searchParams) {
    if (chave.startsWith("utm_") || PARAMS_RASTREAMENTO.has(chave)) continue;
    params.append(chave, valor);
  }
  const busca = params.toString();
  return u.origin + caminho + (busca ? `?${busca}` : "");
}

// itemKey = sha256 hex da URL canônica: estável entre devices (base do sync).
export async function chaveDeItem(urlCanonica: string): Promise<string> {
  const bytes = new TextEncoder().encode(urlCanonica);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Favicon via serviço interno do Chrome: nada de rede externa (local-first).
export function faviconDe(url: string): string {
  const base = chrome.runtime.getURL("/_favicon/");
  return `${base}?pageUrl=${encodeURIComponent(url)}&size=32`;
}

// Pede a permissão opcional "history" — chamar SEMPRE em resposta a gesto do
// usuário (requisito do Chrome). Recusa ou erro viram false, nunca exceção.
export async function pedirHistorico(): Promise<boolean> {
  try {
    return await chrome.permissions.request({ permissions: ["history"] });
  } catch {
    return false;
  }
}
