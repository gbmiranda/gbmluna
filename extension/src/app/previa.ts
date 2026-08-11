// Modo prévia: o shell rodando fora da extensão (http/dev). Sem chrome.*,
// os dados viram um seed determinístico e a ponte vira stub — dá para ver e
// iterar o Plano sem recarregar a extensão (critério do F1 em docs/twoddd.md).
import type { Bridge } from "./bridge";
import type { ItemColetado } from "./store/sources";

export function ehExtensao(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

export function tamanhoSeed(): number {
  const bruto = new URLSearchParams(location.search).get("seed");
  const n = bruto ? Number.parseInt(bruto, 10) : 72;
  if (!Number.isFinite(n) || n <= 0) {
    return 72;
  }
  return Math.min(n, 1000);
}

export function criarBridgeStub(): Bridge {
  return {
    comandar: async () => ({
      ok: false,
      error: "modo prévia — abra o Luna pela extensão para usar os módulos",
    }),
    aoEvento() {},
    aoEstado() {},
  };
}

// Títulos plausíveis por domínio: o seed precisa parecer o mundo real de um
// usuário, não "página N" repetida — é a prévia da experiência.
const SEED_POR_DOMINIO: Record<string, string[]> = {
  "youtube.com": [
    "Rust em 100 segundos",
    "Como funciona o Neural Engine",
    "Lo-fi para programar",
    "Review MacBook M4",
    "Swift concurrency explicado",
    "História do UNIX",
  ],
  "github.com": [
    "gbmiranda/gbmluna",
    "ziglang/zig",
    "microsoft/vscode",
    "anthropics/claude-code",
    "tokio-rs/tokio",
  ],
  "stackoverflow.com": [
    "IndexedDB transaction lifetime",
    "CSS transform performance",
    "Swift actor isolation",
  ],
  "figma.com": ["Luna DS — tokens", "Wireframes twoDDD"],
  "netflix.com": ["Black Mirror", "Dark", "The Playlist"],
  "spotify.com": ["Deep Focus", "Synthwave Radar", "Lo-fi Beats"],
  "wikipedia.org": [
    "Zooming user interface",
    "Filotaxia",
    "Apple Neural Engine",
    "Pixel art",
  ],
  "reddit.com": ["r/programming", "r/macapps", "r/rust"],
  "x.com": ["Feed", "Tech Twitter"],
  "medium.com": ["Design de ZUIs", "Local-first software"],
  "dev.to": ["Chrome extensions MV3", "AudioWorklet na prática"],
  "linear.app": ["Sprint Luna", "Backlog gbml"],
};

export function gerarItensSeed(total: number): ItemColetado[] {
  const agora = Date.now();
  const itens: ItemColetado[] = [];
  const dominios = Object.keys(SEED_POR_DOMINIO);
  let indice = 0;
  while (itens.length < total) {
    for (const dominio of dominios) {
      if (itens.length >= total) {
        break;
      }
      const titulos = SEED_POR_DOMINIO[dominio];
      const volta = Math.floor(indice / dominios.length);
      const titulo = titulos[volta % titulos.length];
      const sufixo = volta >= titulos.length ? ` (${volta})` : "";
      const urlCanonica = `https://${dominio}/${volta}-${titulos.indexOf(titulo)}`;
      itens.push({
        itemKey: `seed-${dominio}-${volta}`,
        url: urlCanonica,
        urlCanonica,
        titulo: `${titulo}${sufixo}`,
        dominio,
        // visitas/recência espalhadas deterministicamente para o Radar variar
        visitas: ((indice * 37) % 90) + 1,
        ultimaVisita: agora - ((indice * 53) % 96) * 3_600_000,
        aberto: indice % 9 === 0,
      });
      indice += 1;
    }
  }
  return itens;
}
