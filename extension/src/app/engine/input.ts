// Entrada do Plano (docs/twoddd.md): wheel = pan, ctrl+wheel (pinça do
// trackpad) = zoom no cursor, drag/pinch com pointer capture e navegação
// completa por teclado. Contrato com a UI: cada cartão expõe `data-tile-id`.
import type { Lente, TilePlano } from "../tipos";
import type { Ponto } from "./camera";
import { screenToWorld, zoomAt } from "./camera";

export interface ControleInput {
  lente(): Lente;
  definirLente(lente: Lente): void;
  iniciarInteracao(): void;
  encerrarInteracao(): void;
  tilesVisiveis(): TilePlano[];
  selecionado(): string | null;
  selecionar(tileId: string): void;
  mergulhar(tileId: string): void;
  subirNivel(): void;
  irParaDeck(): void;
  abrirEmAba(tileId: string): void;
}

// Expoente da pinça do macOS: deltaY pequeno e contínuo vira zoom suave.
const FATOR_ZOOM_WHEEL = 1.0018;
const FATOR_ZOOM_TECLADO = 1.25;
// Sem wheel por ~10 frames = interação encerrada (solta o will-change).
const OCIOSO_WHEEL_MS = 160;
// Cone de ±60° da seleção espacial: tan(60°) limita o desvio ortogonal.
const TAN_CONE = Math.tan(Math.PI / 3);

const DIRECOES: Record<string, Ponto> = {
  ArrowRight: { x: 1, y: 0 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowDown: { x: 0, y: 1 },
  ArrowUp: { x: 0, y: -1 },
};

function alvoEditavel(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  return (
    alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)
  );
}

// Controles nativos cuidam do próprio teclado; o Palco prende o próprio foco.
function alvoReservado(alvo: EventTarget | null): boolean {
  return (
    alvo instanceof Element &&
    (alvo.closest("button, a, [role='button'], .palco") !== null ||
      alvoEditavel(alvo))
  );
}

function centroTile(tile: TilePlano): Ponto {
  return { x: tile.x + tile.w / 2, y: tile.y + tile.h / 2 };
}

// Vizinho mais próximo dentro do cone ±60° na direção pedida; o desvio
// ortogonal pesa dobrado para privilegiar quem está "na linha" da seta.
export function vizinhoNaDirecao(
  de: TilePlano,
  direcao: Ponto,
  tiles: TilePlano[],
): string | null {
  const origem = centroTile(de);
  let melhor: string | null = null;
  let melhorCusto = Infinity;
  for (const tile of tiles) {
    if (tile.id === de.id) continue;
    const alvo = centroTile(tile);
    const vx = alvo.x - origem.x;
    const vy = alvo.y - origem.y;
    const proj = vx * direcao.x + vy * direcao.y;
    if (proj <= 0) continue;
    const orto = Math.abs(vx * direcao.y - vy * direcao.x);
    if (orto > proj * TAN_CONE) continue;
    const custo = proj + 2 * orto;
    if (custo < melhorCusto) {
      melhorCusto = custo;
      melhor = tile.id;
    }
  }
  return melhor;
}

export function anexarInput(
  viewportEl: HTMLElement,
  controle: ControleInput,
): () => void {
  const ponteiros = new Map<number, Ponto>();
  let pinca: { dist: number; meio: Ponto } | null = null;
  let arrastando = false;
  let espaco = false;
  let wheelAtivo = false;
  let wheelTimer: number | null = null;
  let interacaoAtiva = false;

  function pontoLocal(ev: { clientX: number; clientY: number }): Ponto {
    const rect = viewportEl.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  function alvoTile(ev: Event): Element | null {
    return ev.target instanceof Element
      ? ev.target.closest("[data-tile-id]")
      : null;
  }

  function atualizarInteracao(): void {
    const ativa = ponteiros.size > 0 || wheelAtivo;
    if (ativa && !interacaoAtiva) {
      interacaoAtiva = true;
      controle.iniciarInteracao();
    } else if (!ativa && interacaoAtiva) {
      interacaoAtiva = false;
      controle.encerrarInteracao();
    }
  }

  function zoomNoCentro(fator: number): void {
    const centro = {
      x: viewportEl.clientWidth / 2,
      y: viewportEl.clientHeight / 2,
    };
    controle.definirLente(zoomAt(controle.lente(), centro, fator));
  }

  function aoWheel(ev: WheelEvent): void {
    ev.preventDefault();
    // deltaMode 1 = linhas, 2 = páginas; normaliza tudo para px.
    const escala =
      ev.deltaMode === 1
        ? 16
        : ev.deltaMode === 2
          ? viewportEl.clientHeight
          : 1;
    const lente = controle.lente();
    if (ev.ctrlKey) {
      const fator = Math.pow(FATOR_ZOOM_WHEEL, -ev.deltaY * escala);
      controle.definirLente(zoomAt(lente, pontoLocal(ev), fator));
    } else {
      let dx = ev.deltaX * escala;
      let dy = ev.deltaY * escala;
      if (ev.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      controle.definirLente({
        ...lente,
        x: lente.x + dx / lente.s,
        y: lente.y + dy / lente.s,
      });
    }
    wheelAtivo = true;
    atualizarInteracao();
    if (wheelTimer !== null) clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      wheelTimer = null;
      wheelAtivo = false;
      atualizarInteracao();
    }, OCIOSO_WHEEL_MS);
  }

  function aoPointerDown(ev: PointerEvent): void {
    const sobreTile = alvoTile(ev) !== null;
    const elegivel =
      ev.button === 1 ||
      (ev.button === 0 &&
        (espaco ||
          !sobreTile ||
          // segundo toque vira pinch mesmo que comece sobre um cartão
          (ev.pointerType === "touch" && ponteiros.size > 0)));
    if (!elegivel) return;
    viewportEl.setPointerCapture(ev.pointerId);
    ponteiros.set(ev.pointerId, pontoLocal(ev));
    if (ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()] as [Ponto, Ponto];
      pinca = {
        dist: Math.hypot(b.x - a.x, b.y - a.y),
        meio: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      arrastando = false;
    } else if (ponteiros.size === 1) {
      arrastando = true;
    }
    atualizarInteracao();
    if (!sobreTile || espaco || ev.button === 1) ev.preventDefault();
  }

  function aoPointerMove(ev: PointerEvent): void {
    const anterior = ponteiros.get(ev.pointerId);
    if (!anterior) return;
    const ponto = pontoLocal(ev);
    ponteiros.set(ev.pointerId, ponto);
    if (pinca && ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()] as [Ponto, Ponto];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let lente = controle.lente();
      if (pinca.dist > 0 && dist > 0)
        lente = zoomAt(lente, meio, dist / pinca.dist);
      // o mundo acompanha o deslocamento do centro da pinça
      lente = {
        ...lente,
        x: lente.x - (meio.x - pinca.meio.x) / lente.s,
        y: lente.y - (meio.y - pinca.meio.y) / lente.s,
      };
      controle.definirLente(lente);
      pinca = { dist, meio };
    } else if (arrastando) {
      const lente = controle.lente();
      controle.definirLente({
        ...lente,
        x: lente.x - (ponto.x - anterior.x) / lente.s,
        y: lente.y - (ponto.y - anterior.y) / lente.s,
      });
    }
  }

  function aoPointerFim(ev: PointerEvent): void {
    if (!ponteiros.delete(ev.pointerId)) return;
    if (viewportEl.hasPointerCapture(ev.pointerId))
      viewportEl.releasePointerCapture(ev.pointerId);
    if (ponteiros.size < 2) pinca = null;
    arrastando = ponteiros.size === 1;
    atualizarInteracao();
  }

  function aoDuploClique(ev: MouseEvent): void {
    const tile = alvoTile(ev);
    const id = tile?.getAttribute("data-tile-id");
    if (id) {
      ev.preventDefault();
      controle.mergulhar(id);
    }
  }

  function moverSelecao(direcao: Ponto): void {
    const tiles = controle.tilesVisiveis();
    if (tiles.length === 0) return;
    const selecionadoId = controle.selecionado();
    const origem = tiles.find((t) => t.id === selecionadoId);
    if (!origem) {
      // sem seleção: começa pelo tile mais próximo do centro do viewport
      const centro = screenToWorld(controle.lente(), {
        x: viewportEl.clientWidth / 2,
        y: viewportEl.clientHeight / 2,
      });
      let melhor: string | null = null;
      let melhorDist = Infinity;
      for (const tile of tiles) {
        const c = centroTile(tile);
        const dist = (c.x - centro.x) ** 2 + (c.y - centro.y) ** 2;
        if (dist < melhorDist) {
          melhorDist = dist;
          melhor = tile.id;
        }
      }
      if (melhor) controle.selecionar(melhor);
      return;
    }
    const vizinho = vizinhoNaDirecao(origem, direcao, tiles);
    if (vizinho) controle.selecionar(vizinho);
  }

  function aoTeclar(ev: KeyboardEvent): void {
    // Cmd+K é do Farol — ele registra o próprio atalho.
    if (ev.metaKey && (ev.key === "k" || ev.key === "K")) return;
    if (alvoEditavel(ev.target)) return;
    if (ev.metaKey) {
      switch (ev.key) {
        case "0":
          ev.preventDefault();
          controle.irParaDeck();
          return;
        case "=":
        case "+":
          ev.preventDefault();
          zoomNoCentro(FATOR_ZOOM_TECLADO);
          return;
        case "-":
        case "_":
          ev.preventDefault();
          zoomNoCentro(1 / FATOR_ZOOM_TECLADO);
          return;
        case "Enter": {
          const id = controle.selecionado();
          if (id) {
            ev.preventDefault();
            controle.abrirEmAba(id);
          }
          return;
        }
      }
      return;
    }
    if (alvoReservado(ev.target)) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      controle.subirNivel();
      return;
    }
    if (ev.key === "Enter") {
      const id = controle.selecionado();
      if (id) {
        ev.preventDefault();
        controle.mergulhar(id);
      }
      return;
    }
    if (ev.key === " ") {
      espaco = true;
      ev.preventDefault();
      return;
    }
    const direcao = DIRECOES[ev.key];
    if (direcao) {
      ev.preventDefault();
      moverSelecao(direcao);
    }
  }

  function aoSoltarTecla(ev: KeyboardEvent): void {
    if (ev.key === " ") espaco = false;
  }

  function aoDesfocar(): void {
    espaco = false;
    ponteiros.clear();
    pinca = null;
    arrastando = false;
    atualizarInteracao();
  }

  viewportEl.addEventListener("wheel", aoWheel, { passive: false });
  viewportEl.addEventListener("pointerdown", aoPointerDown);
  viewportEl.addEventListener("pointermove", aoPointerMove);
  viewportEl.addEventListener("pointerup", aoPointerFim);
  viewportEl.addEventListener("pointercancel", aoPointerFim);
  viewportEl.addEventListener("dblclick", aoDuploClique);
  window.addEventListener("keydown", aoTeclar);
  window.addEventListener("keyup", aoSoltarTecla);
  window.addEventListener("blur", aoDesfocar);

  return () => {
    viewportEl.removeEventListener("wheel", aoWheel);
    viewportEl.removeEventListener("pointerdown", aoPointerDown);
    viewportEl.removeEventListener("pointermove", aoPointerMove);
    viewportEl.removeEventListener("pointerup", aoPointerFim);
    viewportEl.removeEventListener("pointercancel", aoPointerFim);
    viewportEl.removeEventListener("dblclick", aoDuploClique);
    window.removeEventListener("keydown", aoTeclar);
    window.removeEventListener("keyup", aoSoltarTecla);
    window.removeEventListener("blur", aoDesfocar);
    if (wheelTimer !== null) clearTimeout(wheelTimer);
    wheelAtivo = false;
    aoDesfocar();
  };
}
