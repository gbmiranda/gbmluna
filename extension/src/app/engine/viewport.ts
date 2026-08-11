// Aplica a Lente no DOM: um único nó (#mundo) com transform compositor-only,
// um rAF por frame (chamadas extras coalescem) e will-change apenas enquanto
// há interação ou animação — will-change permanente força camada eterna na GPU.
import type { Lente } from "../tipos";
import type { Tamanho } from "./camera";
import { clampLente } from "./camera";

export type OuvinteLente = (lente: Lente) => void;

export interface Viewport {
  lente(): Lente;
  tamanho(): Tamanho;
  definirLente(alvo: Lente): void;
  animarPara(alvo: Lente, ms: number): Promise<void>;
  onLente(ouvinte: OuvinteLente): () => void;
  iniciarInteracao(): void;
  encerrarInteracao(): void;
  destruir(): void;
}

interface Animacao {
  de: Lente;
  para: Lente;
  inicio: number;
  ms: number;
  resolver: () => void;
}

// cubic-bezier em JS porque a Lente não é uma propriedade CSS animável — o
// mesmo glide do DS (--ds-glide) vale para enquadramentos e mergulhos.
function criarBezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const amostraX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const amostraY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const derivadaX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    // Newton–Raphson converge em poucos passos; bisseção cobre derivada rasa.
    for (let i = 0; i < 8; i++) {
      const erro = amostraX(t) - x;
      if (Math.abs(erro) < 1e-6) return amostraY(t);
      const d = derivadaX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= erro / d;
    }
    let baixo = 0;
    let alto = 1;
    t = x;
    while (alto - baixo > 1e-6) {
      if (amostraX(t) < x) baixo = t;
      else alto = t;
      t = (baixo + alto) / 2;
    }
    return amostraY(t);
  };
}

const easeGlide = criarBezier(0.2, 0, 0, 1);

export function criarViewport(
  viewportEl: HTMLElement,
  mundoEl: HTMLElement,
): Viewport {
  const ouvintes = new Set<OuvinteLente>();
  let atual: Lente = { x: 0, y: 0, s: 1 };
  let rafId: number | null = null;
  let sujo = true;
  let anim: Animacao | null = null;
  let retencoes = 0;

  mundoEl.style.transformOrigin = "0 0";

  // Contador porque interação do usuário e animação podem se sobrepor.
  function reter(): void {
    retencoes++;
    if (retencoes === 1) mundoEl.style.willChange = "transform";
  }

  function soltar(): void {
    retencoes = Math.max(0, retencoes - 1);
    if (retencoes === 0) mundoEl.style.willChange = "";
  }

  function aplicar(): void {
    const { x, y, s } = atual;
    mundoEl.style.transform = `translate3d(${-x * s}px, ${-y * s}px, 0) scale(${s})`;
    for (const ouvinte of ouvintes) ouvinte(atual);
  }

  function agendar(): void {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(quadro);
  }

  function quadro(agora: number): void {
    rafId = null;
    if (anim) {
      const t = Math.min(1, (agora - anim.inicio) / anim.ms);
      const p = easeGlide(t);
      atual = {
        x: anim.de.x + (anim.para.x - anim.de.x) * p,
        y: anim.de.y + (anim.para.y - anim.de.y) * p,
        s: anim.de.s + (anim.para.s - anim.de.s) * p,
      };
      sujo = false;
      aplicar();
      if (t >= 1) concluirAnimacao();
      else agendar();
      return;
    }
    if (sujo) {
      sujo = false;
      aplicar();
    }
  }

  // Interromper resolve (não rejeita): quem animava só quer saber que acabou.
  function concluirAnimacao(): void {
    if (!anim) return;
    const { resolver } = anim;
    anim = null;
    soltar();
    resolver();
  }

  function definirLente(alvo: Lente): void {
    concluirAnimacao(); // input do usuário vence a animação em andamento
    atual = clampLente(alvo);
    sujo = true;
    agendar();
  }

  function animarPara(alvo: Lente, ms: number): Promise<void> {
    concluirAnimacao();
    const para = clampLente(alvo);
    if (ms <= 0) {
      definirLente(para);
      return Promise.resolve();
    }
    reter();
    return new Promise<void>((resolver) => {
      anim = { de: atual, para, inicio: performance.now(), ms, resolver };
      agendar();
    });
  }

  agendar(); // primeiro paint já sai com a Lente inicial aplicada

  return {
    lente: () => ({ ...atual }),
    tamanho: () => ({ w: viewportEl.clientWidth, h: viewportEl.clientHeight }),
    definirLente,
    animarPara,
    onLente(ouvinte: OuvinteLente): () => void {
      ouvintes.add(ouvinte);
      return () => {
        ouvintes.delete(ouvinte);
      };
    },
    iniciarInteracao: reter,
    encerrarInteracao: soltar,
    destruir(): void {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      concluirAnimacao();
      ouvintes.clear();
      retencoes = 0;
      mundoEl.style.willChange = "";
    },
  };
}
