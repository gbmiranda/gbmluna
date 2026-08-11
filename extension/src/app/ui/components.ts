// Factories DOM puras do Luna DS (docs/design-system.md §3) — sem framework,
// sem estado próprio. Toda cor via classes/tokens; nenhum estilo inline de cor.

import type { TilePlano } from "../tipos";

/* ------------------------------------------------------------- pixel art */

// Converte um mapa de bits ("." apagado, "#" aceso) em SVG pixel art 16×16:
// cada célula vira um <rect> de `escala`×`escala`. crispEdges + currentColor
// deixam o ícone nítido e temático (a cor vem do texto ao redor).
function svgPixel(mapa: readonly string[], escala: number): string {
  const rects: string[] = [];
  mapa.forEach((linha, y) => {
    for (let x = 0; x < linha.length; x++) {
      if (linha[x] === "#") {
        rects.push(
          `<rect x="${x * escala}" y="${y * escala}" width="${escala}" height="${escala}"/>`,
        );
      }
    }
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"` +
    ` fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">${rects.join("")}</svg>`
  );
}

// Bitmaps 8×8 (renderizados a 2×2 dentro do viewBox 16×16).
const ICONES = {
  estrela: [
    "...#....",
    "...#....",
    "..###...",
    "#######.",
    "..###...",
    "...#....",
    "...#....",
    "........",
  ],
  ancora: [
    "...##...",
    "..#..#..",
    "...##...",
    ".######.",
    "...##...",
    "#..##..#",
    "#..##..#",
    ".######.",
  ],
  casa: [
    "...##...",
    "..####..",
    ".######.",
    "########",
    ".######.",
    ".##..##.",
    ".##..##.",
    ".######.",
  ],
  play: [
    "..#.....",
    "..##....",
    "..###...",
    "..####..",
    "..###...",
    "..##....",
    "..#.....",
    "........",
  ],
  stop: [
    "........",
    ".######.",
    ".######.",
    ".######.",
    ".######.",
    ".######.",
    ".######.",
    "........",
  ],
  "aba-externa": [
    ".....###",
    "......##",
    ".....#.#",
    "#####...",
    "#...#...",
    "#...#...",
    "#...#...",
    "#####...",
  ],
  cadeado: [
    "..####..",
    ".#....#.",
    ".#....#.",
    "########",
    "########",
    "###..###",
    "###..###",
    "########",
  ],
} as const;

export type NomeIcone = keyof typeof ICONES;

export function iconePixel(nome: NomeIcone): string {
  return svgPixel(ICONES[nome], 2);
}

// Lua pixel 16×16 em 5 fases (0 nova … 4 cheia) — a Lua de zoom do HUD.
// Disco de raio 7; a fase acende colunas a partir da direita (lado que
// "cresce" na lua crescente); o contorno fica sempre visível, esmaecido,
// para a lua nova não sumir.
export function luaSvg(fase: 0 | 1 | 2 | 3 | 4): string {
  const cheios: string[] = [];
  const contorno: string[] = [];
  const centro = 7.5;
  const raio = 7;
  // coluna mínima acesa por fase: nova (nenhuma) → cheia (todas)
  const limite = [16, 10, 8, 5, 0][fase] as number;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - centro, y + 0.5 - centro);
      if (d > raio) continue;
      const pixel = `<rect x="${x}" y="${y}" width="1" height="1"/>`;
      if (x >= limite) cheios.push(pixel);
      else if (d > raio - 1.4) contorno.push(pixel);
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16"` +
    ` fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">` +
    `<g fill-opacity="0.35">${contorno.join("")}</g>${cheios.join("")}</svg>`
  );
}

// Wordmark "LUNA" pixel — grade 16×5, só retângulos (marca do DS §2.3;
// usada apenas no HUD e na tela vazia).
const MAPA_WORDMARK = [
  "#...#.#.#..#..#.",
  "#...#.#.##.#.#.#",
  "#...#.#.#.##.###",
  "#...#.#.#..#.#.#",
  "###.###.#..#.#.#",
] as const;

export function wordmarkSvg(): string {
  const rects: string[] = [];
  MAPA_WORDMARK.forEach((linha, y) => {
    for (let x = 0; x < linha.length; x++) {
      if (linha[x] === "#")
        rects.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 5" width="48" height="15"` +
    ` fill="currentColor" shape-rendering="crispEdges" role="img" aria-label="Luna">` +
    `${rects.join("")}</svg>`
  );
}

/* ------------------------------------------------------------ componentes */

// Cartão de site (z1): o tile inteiro é o alvo e o nome acessível é o título.
export function criarCartao(tile: TilePlano, favicon?: string): HTMLElement {
  const raiz = document.createElement("div");
  raiz.className = "cartao";
  raiz.tabIndex = 0;
  raiz.dataset.id = tile.id;
  raiz.setAttribute("aria-label", tile.titulo);
  raiz.style.left = `${tile.x}px`;
  raiz.style.top = `${tile.y}px`;
  raiz.style.width = `${tile.w}px`;
  raiz.style.height = `${tile.h}px`;
  // brilho por Radar via custom prop (o CSS converte em opacity)
  raiz.style.setProperty("--radar", String(tile.radar));
  if (tile.ancorado) raiz.classList.add("is-ancorado");

  const cabeca = document.createElement("div");
  cabeca.className = "cartao-cabeca";
  if (favicon) {
    const img = document.createElement("img");
    img.className = "cartao-favicon pixel";
    img.src = favicon;
    img.alt = "";
    img.width = 24;
    img.height = 24;
    cabeca.append(img);
  } else {
    // sem favicon: estrela pixel como marcador neutro
    const marcador = document.createElement("span");
    marcador.className = "cartao-favicon";
    marcador.innerHTML = iconePixel("estrela");
    cabeca.append(marcador);
  }
  const ancora = document.createElement("span");
  ancora.className = "cartao-ancora";
  ancora.title = "Ancorado — o layout automático não move este tile";
  ancora.innerHTML = iconePixel("ancora");
  cabeca.append(ancora);
  raiz.append(cabeca);

  const titulo = document.createElement("div");
  titulo.className = "cartao-titulo";
  titulo.textContent = tile.titulo;
  raiz.append(titulo);

  if (tile.dominio) {
    const dominio = document.createElement("div");
    dominio.className = "cartao-dominio";
    dominio.textContent = tile.dominio;
    raiz.append(dominio);
  }
  return raiz;
}

export type EstadoBadge = "ok" | "warn" | "err" | "neutro";

// Badge de estado: quadrado 8×8 + rótulo — forma e texto, nunca só cor.
export function criarBadge(estado: EstadoBadge, rotulo: string): HTMLElement {
  const raiz = document.createElement("span");
  raiz.className = estado === "neutro" ? "badge" : `badge is-${estado}`;
  const quadrado = document.createElement("span");
  quadrado.className = "badge-quadrado";
  quadrado.setAttribute("aria-hidden", "true");
  const texto = document.createElement("span");
  texto.textContent = rotulo;
  raiz.append(quadrado, texto);
  return raiz;
}

export interface EstadoModulo {
  tipo: EstadoBadge;
  rotulo: string;
}

// Base de tile de módulo (320×400): cabeçalho padronizado + corpo livre —
// cada módulo só preenche o corpo, o contrato visual é único.
export function criarTileModuloBase(
  titulo: string,
  icone: NomeIcone,
  estado: EstadoModulo,
): { raiz: HTMLElement; corpo: HTMLElement } {
  const raiz = document.createElement("div");
  raiz.className = "tile-modulo";
  raiz.setAttribute("role", "region");
  raiz.setAttribute("aria-label", titulo);

  const cabecalho = document.createElement("div");
  cabecalho.className = "tile-modulo-cabecalho";
  const marcador = document.createElement("span");
  marcador.className = "tile-modulo-icone";
  marcador.innerHTML = iconePixel(icone);
  const nome = document.createElement("span");
  nome.className = "tile-modulo-titulo";
  nome.textContent = titulo;
  cabecalho.append(marcador, nome, criarBadge(estado.tipo, estado.rotulo));
  raiz.append(cabecalho);

  const corpo = document.createElement("div");
  corpo.className = "tile-modulo-corpo";
  raiz.append(corpo);
  return { raiz, corpo };
}

export type VarianteBotao = "primario" | "fantasma" | "perigo";

export function criarBotao(
  rotulo: string,
  variante: VarianteBotao,
  onClick: () => void,
): HTMLButtonElement {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className =
    variante === "primario" ? "botao" : `botao botao-${variante}`;
  botao.textContent = rotulo;
  botao.addEventListener("click", onClick);
  return botao;
}

export type TipoToast = "info" | "ok" | "err";

// Fábrica de toasts: recebe a raiz uma vez, devolve o emissor.
// role="status" anuncia sem roubar foco; some sozinho em 4 s.
export function criarToast(
  raiz: HTMLElement,
): (mensagem: string, tipo?: TipoToast) => void {
  return (mensagem, tipo = "info") => {
    const toast = document.createElement("div");
    toast.className = tipo === "info" ? "toast" : `toast is-${tipo}`;
    toast.setAttribute("role", "status");
    if (tipo !== "info") {
      // estado nunca só por cor: o quadrado + rótulo acompanham a borda
      toast.append(criarBadge(tipo, tipo === "ok" ? "ok" : "erro"));
    }
    const texto = document.createElement("span");
    texto.textContent = mensagem;
    toast.append(texto);
    raiz.append(toast);
    window.setTimeout(() => toast.remove(), 4000);
  };
}
