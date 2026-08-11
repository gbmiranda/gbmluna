// Palco (o "z2"): overlay full-screen com iframe real — nunca iframe escalado
// por CSS (blur + bugs de input). O Mergulho é FLIP: anima o rect do cartão
// até a tela cheia sem tocar na Lente. Pool LRU de 3 iframes; suspender é
// remover do DOM de verdade (memória é o risco nº 3 do docs/twoddd.md).
// O engine não escreve CSS: só as classes do contrato e transforms inline.
import type { TilePlano } from "../tipos";

export interface CallbacksPalco {
  aoFechar(): void;
  aoAbrirEmAba(url: string): void;
  aoAncorar(tileId: string): void;
}

export interface Palco {
  abrir(tile: TilePlano, rectOrigemPx: DOMRect): void;
  fechar(): void;
  estaAberto(): boolean;
  destruir(): void;
}

const LIMITE_POOL = 3;
const TIMEOUT_EMBED_MS = 4000;
const DURACAO_FLIP_MS = 260;
const DURACAO_CROSSFADE_MS = 80;
const EASE_GLIDE = "cubic-bezier(0.2, 0, 0, 1)";
// NUNCA allow-top-navigation: anti frame-busting (segurança, docs/twoddd.md).
const SANDBOX_IFRAME =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads";
const ALLOW_IFRAME = "autoplay; fullscreen; clipboard-write";

interface EntradaPool {
  id: string;
  iframe: HTMLIFrameElement;
}

export function criarPalco(
  raizEl: HTMLElement,
  callbacks: CallbacksPalco,
): Palco {
  const doc = raizEl.ownerDocument;

  function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    classe: string,
  ): HTMLElementTagNameMap[K] {
    const elemento = doc.createElement(tag);
    if (classe) elemento.className = classe;
    return elemento;
  }

  function botao(rotulo: string): HTMLButtonElement {
    const b = el("button", "");
    b.type = "button";
    b.textContent = rotulo;
    return b;
  }

  const palcoEl = el("section", "palco");
  palcoEl.setAttribute("role", "dialog");
  palcoEl.setAttribute("aria-modal", "true");
  palcoEl.tabIndex = -1;

  const headerEl = el("header", "palco-header");
  const tituloEl = el("h1", "palco-titulo");
  const urlEl = el("code", "palco-url");
  const acoesEl = el("div", "palco-acoes");
  const botaoAba = botao("Abrir na aba");
  const botaoAncorar = botao("Ancorar");
  const botaoFechar = botao("Fechar");
  acoesEl.append(botaoAba, botaoAncorar, botaoFechar);
  headerEl.append(tituloEl, urlEl, acoesEl);

  const quadroEl = el("div", "palco-quadro");

  const bloqueadoEl = el("div", "palco-bloqueado");
  const bloqueadoMsg = el("p", "");
  bloqueadoMsg.textContent = "Este site não permite embutir. Abrir na aba?";
  const botaoBloqueado = botao("Abrir na aba");
  bloqueadoEl.append(bloqueadoMsg, botaoBloqueado);
  bloqueadoEl.hidden = true;

  palcoEl.append(headerEl, quadroEl, bloqueadoEl);
  raizEl.append(palcoEl);

  const pool: EntradaPool[] = []; // último = mais recente (LRU no início)
  let tileAtual: TilePlano | null = null;
  let rectOrigem: DOMRect | null = null;
  let focoAnterior: Element | null = null;
  let timerEmbed: number | null = null;
  let animAtual: Animation | null = null;

  function reduzMovimento(): boolean {
    const win = doc.defaultView;
    return win
      ? win.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  }

  function cancelarTimerEmbed(): void {
    if (timerEmbed !== null) clearTimeout(timerEmbed);
    timerEmbed = null;
  }

  function marcarBloqueado(): void {
    cancelarTimerEmbed();
    palcoEl.classList.add("is-bloqueado");
    bloqueadoEl.hidden = false;
  }

  function limparBloqueio(): void {
    palcoEl.classList.remove("is-bloqueado");
    bloqueadoEl.hidden = true;
  }

  function criarIframe(url: string): HTMLIFrameElement {
    const iframe = doc.createElement("iframe");
    iframe.setAttribute("sandbox", SANDBOX_IFRAME);
    iframe.setAttribute("allow", ALLOW_IFRAME);
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.src = url;
    iframe.addEventListener("load", () => {
      // Só o iframe visível decide o estado — um load atrasado de um iframe
      // suspenso não pode limpar o bloqueio do atual.
      if (iframe.isConnected) {
        cancelarTimerEmbed();
        limparBloqueio();
      }
    });
    return iframe;
  }

  function anexarQuadro(tile: TilePlano): void {
    cancelarTimerEmbed();
    for (const filho of [...quadroEl.children]) filho.remove();
    limparBloqueio();
    const url = tile.url;
    if (!url) {
      // Tile sem URL (módulo) não tem o que embutir: fallback honesto.
      marcarBloqueado();
      return;
    }
    const indice = pool.findIndex((entrada) => entrada.id === tile.id);
    let entrada: EntradaPool;
    if (indice >= 0) {
      [entrada] = pool.splice(indice, 1) as [EntradaPool];
    } else {
      entrada = { id: tile.id, iframe: criarIframe(url) };
    }
    pool.push(entrada); // usado agora = mais recente
    while (pool.length > LIMITE_POOL) {
      const suspenso = pool.shift();
      suspenso?.iframe.remove(); // suspender = remover do DOM (libera memória)
    }
    // Sem `load` em 4 s = site que recusa embed (X-Frame-Options/CSP).
    timerEmbed = setTimeout(marcarBloqueado, TIMEOUT_EMBED_MS);
    quadroEl.append(entrada.iframe);
  }

  function animarEntrada(origem: DOMRect): void {
    animAtual?.cancel();
    if (reduzMovimento()) {
      // corte seco + crossfade: nada essencial depende do movimento
      animAtual = palcoEl.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: DURACAO_CROSSFADE_MS,
        easing: "linear",
      });
      return;
    }
    const destino = palcoEl.getBoundingClientRect();
    if (destino.width === 0 || destino.height === 0) return;
    const dx = origem.left - destino.left;
    const dy = origem.top - destino.top;
    const sx = origem.width / destino.width;
    const sy = origem.height / destino.height;
    animAtual = palcoEl.animate(
      [
        {
          transformOrigin: "0 0",
          transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
        },
        { transformOrigin: "0 0", transform: "none" },
      ],
      { duration: DURACAO_FLIP_MS, easing: EASE_GLIDE },
    );
  }

  function abrir(tile: TilePlano, rectOrigemPx: DOMRect): void {
    const jaAberto = tileAtual !== null;
    tileAtual = tile;
    rectOrigem = rectOrigemPx;
    tituloEl.textContent = tile.titulo;
    urlEl.textContent = tile.url ?? "";
    palcoEl.setAttribute("aria-label", tile.titulo);
    anexarQuadro(tile);
    if (jaAberto) return; // troca de tile com o Palco aberto: sem FLIP de novo
    focoAnterior = doc.activeElement;
    palcoEl.classList.add("is-aberto");
    animarEntrada(rectOrigemPx);
    palcoEl.focus();
  }

  function encerrar(): void {
    palcoEl.classList.remove("is-aberto");
    limparBloqueio();
    for (const filho of [...quadroEl.children]) filho.remove(); // fica no pool
    if (focoAnterior instanceof HTMLElement) focoAnterior.focus();
    focoAnterior = null;
    callbacks.aoFechar();
  }

  function fechar(): void {
    if (!tileAtual) return;
    tileAtual = null;
    cancelarTimerEmbed();
    animAtual?.cancel();
    const origem = rectOrigem;
    rectOrigem = null;
    const destino = palcoEl.getBoundingClientRect();
    if (
      reduzMovimento() ||
      !origem ||
      destino.width === 0 ||
      destino.height === 0
    ) {
      animAtual = palcoEl.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: DURACAO_CROSSFADE_MS,
        easing: "linear",
      });
      animAtual.onfinish = encerrar;
      return;
    }
    // FLIP reverso: tela cheia de volta ao rect do cartão de origem.
    const dx = origem.left - destino.left;
    const dy = origem.top - destino.top;
    const sx = origem.width / destino.width;
    const sy = origem.height / destino.height;
    animAtual = palcoEl.animate(
      [
        { transformOrigin: "0 0", transform: "none" },
        {
          transformOrigin: "0 0",
          transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
        },
      ],
      { duration: DURACAO_FLIP_MS, easing: EASE_GLIDE },
    );
    animAtual.onfinish = encerrar;
  }

  function focaveis(): HTMLElement[] {
    const lista: HTMLElement[] = [botaoAba, botaoAncorar, botaoFechar];
    if (!bloqueadoEl.hidden) lista.push(botaoBloqueado);
    return lista;
  }

  // Foco preso no overlay enquanto aberto (a11y): Tab circula, Esc fecha.
  function aoTeclar(ev: KeyboardEvent): void {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation(); // o Esc do Palco fecha o Palco, não sobe de nível
      fechar();
      return;
    }
    if (ev.key !== "Tab") return;
    const lista = focaveis();
    const primeiro = lista[0];
    const ultimo = lista[lista.length - 1];
    const ativo = doc.activeElement;
    if (ev.shiftKey && (ativo === primeiro || ativo === palcoEl)) {
      ev.preventDefault();
      ultimo.focus();
    } else if (!ev.shiftKey && ativo === ultimo) {
      ev.preventDefault();
      primeiro.focus();
    } else if (!(ativo instanceof Node) || !palcoEl.contains(ativo)) {
      ev.preventDefault();
      primeiro.focus();
    }
  }

  function abrirEmAba(): void {
    const url = tileAtual?.url;
    if (url) callbacks.aoAbrirEmAba(url);
  }

  palcoEl.addEventListener("keydown", aoTeclar);
  botaoAba.addEventListener("click", abrirEmAba);
  botaoBloqueado.addEventListener("click", abrirEmAba);
  botaoAncorar.addEventListener("click", () => {
    if (tileAtual) callbacks.aoAncorar(tileAtual.id);
  });
  botaoFechar.addEventListener("click", fechar);

  return {
    abrir,
    fechar,
    estaAberto: () => tileAtual !== null,
    destruir(): void {
      cancelarTimerEmbed();
      animAtual?.cancel();
      pool.length = 0;
      tileAtual = null;
      palcoEl.remove(); // leva junto listeners e iframes anexados
    },
  };
}
