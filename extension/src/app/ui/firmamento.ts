// Firmamento — o céu vivo do Luna (docs/twoddd.md): ~3000 pixels RGB
// individuais, estilo painel OLED, pulsando em ondas sincronizadas atrás do
// Plano. Canvas 2D + typed arrays: nada de DOM, nada de GC no tick.

import type { Lente } from "../tipos";

export type NivelFirmamento = "z0" | "z1";

export interface PontoQuente {
  x: number; // wu
  y: number; // wu
  peso: number; // 0..1
}

export interface Firmamento {
  atualizarLente(lente: Lente): void;
  modoNivel(nivel: NivelFirmamento): void;
  releTema(): void;
  aquecer(pontos: PontoQuente[]): void;
  destruir(): void;
}

const TOTAL = 3000;
const RAIO_CAMPO = 8000; // wu ao redor da origem
const PARALLAX = 0.6; // o céu segue a Lente a 0.6× — fundo distante
const RAIO_CALOR = 700; // wu de alcance máximo de um ponto quente

// PRNG determinístico (mulberry32): mesma semente ⇒ mesmo céu em qualquer
// máquina e em qualquer recarga — idempotência até na decoração.
function mulberry32(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function criarFirmamento(canvas: HTMLCanvasElement): Firmamento {
  const talvezCtx = canvas.getContext("2d");
  if (!talvezCtx) throw new Error("Firmamento: contexto 2D indisponível");
  const ctx: CanvasRenderingContext2D = talvezCtx;

  const xs = new Float32Array(TOTAL);
  const ys = new Float32Array(TOTAL);
  const fases = new Float32Array(TOTAL);
  const brilhosBase = new Float32Array(TOTAL);
  const cintilos = new Float32Array(TOTAL);
  const matizes = new Uint8Array(TOTAL); // 0 luar · 1..7 --t-hue-n · 8 accent

  const rnd = mulberry32(7);
  for (let i = 0; i < TOTAL; i++) {
    // disco uniforme: r = R·√u espalha sem adensar o centro
    const r = RAIO_CAMPO * Math.sqrt(rnd());
    const ang = rnd() * Math.PI * 2;
    xs[i] = r * Math.cos(ang);
    ys[i] = r * Math.sin(ang);
    // fase espacial: vizinhos quase em fase ⇒ a onda de "acende e apaga"
    // varre o céu em diagonal, sincronizada (não é ruído independente)
    fases[i] = (xs[i] + ys[i]) * 0.0007;
    // quadrado do uniforme: maioria fraca, poucos brilhantes — céu crível
    const u = rnd();
    brilhosBase[i] = 0.3 + 0.7 * u * u;
    // ~1/4 dos pixels carrega um matiz de cluster; o resto é luar
    matizes[i] = rnd() < 0.25 ? 1 + Math.floor(rnd() * 7) : 0;
  }
  const matizesBase = matizes.slice(); // aquecer() recomeça daqui (idempotente)

  let largura = 0;
  let altura = 0;
  let lente: Lente = { x: 0, y: 0, s: 1 };
  let fatorNivel = 1; // no z1 o céu recua para 40% do brilho
  let t = 0;
  let cores: string[] = [];
  let idTick: number | undefined;
  let desenhoPedido = false;

  const reduzido = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  // Lê as cores dos tokens UMA vez por troca de tema — getComputedStyle
  // dentro do tick custaria um recálculo de estilo por frame.
  function releTema(): void {
    const estilo = getComputedStyle(document.documentElement);
    const ler = (token: string): string =>
      estilo.getPropertyValue(token).trim();
    // reserva: cor de texto já resolvida do tema (nunca um hex literal aqui)
    const reserva = estilo.color;
    const luar = ler("--t-moon") || reserva;
    cores = [luar];
    for (let n = 1; n <= 7; n++) cores.push(ler(`--t-hue-${n}`) || luar);
    cores.push(ler("--t-accent") || luar);
    agendarDesenho();
  }

  function desenhar(): void {
    ctx.clearRect(0, 0, largura, altura);
    // Parallax 0.6× da Lente: translação a 0.6× e zoom sub-linear (s^0.6).
    // O céu acompanha o Plano mas "fica para trás" no pan e no mergulho,
    // e no zoom mínimo ainda preenche a tela em vez de colapsar num ponto.
    const escala = Math.pow(lente.s, PARALLAX);
    const cx = largura / 2 - lente.x * PARALLAX * escala;
    const cy = altura / 2 - lente.y * PARALLAX * escala;

    let corAtual = -1;
    for (let i = 0; i < TOTAL; i++) {
      const sx = cx + xs[i] * escala;
      if (sx < -3 || sx > largura + 3) continue;
      const sy = cy + ys[i] * escala;
      if (sy < -3 || sy > altura + 3) continue;
      // respiração: brilho = base · (0.55 + 0.45·sin(t·0.8 + fase)) — a onda
      // global "acende e apaga" sincronizada pela fase espacial; o cintilo
      // (twinkle raro) soma por cima e decai sozinho
      const onda = 0.55 + 0.45 * Math.sin(t * 0.8 + fases[i]);
      const brilho = brilhosBase[i] * onda * fatorNivel + cintilos[i];
      if (brilho < 0.03) continue;
      ctx.globalAlpha = brilho > 1 ? 1 : brilho;
      const m = matizes[i];
      if (m !== corAtual) {
        corAtual = m;
        ctx.fillStyle = cores[m];
      }
      // quadrados 2×2/3×3 via fillRect (nunca arc): constelação 8-bit de
      // verdade, e fillRect é mais barato que arc
      const lado = brilhosBase[i] > 0.78 ? 3 : 2;
      ctx.fillRect(sx | 0, sy | 0, lado, lado);
    }
    ctx.globalAlpha = 1;
  }

  function agendarDesenho(): void {
    if (desenhoPedido) return;
    desenhoPedido = true;
    requestAnimationFrame(() => {
      desenhoPedido = false;
      desenhar();
    });
  }

  // Simulação a 30 fps (setInterval 33 ms) separada do paint (rAF): o tempo
  // anda em ritmo fixo e o desenho pega carona no vsync.
  function passo(): void {
    t += 0.033;
    for (let i = 0; i < TOTAL; i++) {
      if (cintilos[i] > 0.01) cintilos[i] *= 0.86;
      else cintilos[i] = 0;
    }
    // twinkle raro: ~2 faíscas por segundo no campo inteiro (reusa o PRNG
    // para não puxar Math.random; determinismo aqui é indiferente)
    if (rnd() < 0.07) cintilos[Math.floor(rnd() * TOTAL)] = 0.9;
    agendarDesenho();
  }

  function ligar(): void {
    // prefers-reduced-motion: sem tick — a cena fica estática e só redesenha
    // quando lente/tema/nível mudarem
    if (reduzido || document.hidden || idTick !== undefined) return;
    idTick = window.setInterval(passo, 33);
  }

  function desligar(): void {
    if (idTick === undefined) return;
    clearInterval(idTick);
    idTick = undefined;
  }

  // Aba oculta não gasta bateria: pausa o tick e retoma ao voltar.
  function aoMudarVisibilidade(): void {
    if (document.hidden) desligar();
    else ligar();
  }

  function redimensionar(): void {
    // devicePixelRatio com teto 2: retina sim, 3× não vale o fill-rate
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    largura = window.innerWidth;
    altura = window.innerHeight;
    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(altura * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    agendarDesenho();
  }

  window.addEventListener("resize", redimensionar);
  document.addEventListener("visibilitychange", aoMudarVisibilidade);

  releTema();
  redimensionar();
  ligar();

  return {
    atualizarLente(nova) {
      lente = nova;
      agendarDesenho();
    },
    modoNivel(nivel) {
      fatorNivel = nivel === "z1" ? 0.4 : 1;
      agendarDesenho();
    },
    releTema,
    aquecer(pontos) {
      // O Radar esquenta a cena: pixels a ≤ RAIO_CALOR·peso wu de um ponto
      // quente trocam o matiz para accent. Cada chamada recomeça do campo
      // base — reaplicar a mesma lista é no-op visual (idempotente).
      matizes.set(matizesBase);
      for (const ponto of pontos) {
        const alcance = RAIO_CALOR * Math.min(1, Math.max(0, ponto.peso));
        const alcance2 = alcance * alcance;
        for (let i = 0; i < TOTAL; i++) {
          const dx = xs[i] - ponto.x;
          const dy = ys[i] - ponto.y;
          if (dx * dx + dy * dy <= alcance2) matizes[i] = 8;
        }
      }
      agendarDesenho();
    },
    destruir() {
      desligar();
      window.removeEventListener("resize", redimensionar);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    },
  };
}
