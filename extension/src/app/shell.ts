// Bootstrap do shell Luna: liga store → engine → ui → bridge (docs/twoddd.md).
// Cada camada é cega para as outras; este arquivo é o único que as conhece.
import { criarBridge } from "./bridge";
import { TRANSLATOR_MODULE } from "../protocol";
import type { ClusterPlano, Lente, TilePlano } from "./tipos";
import { DECK_RECT, TILE_MODULO, TILE_SITE } from "./tipos";
import { coletar, faviconDe, pedirHistorico } from "./store/sources";
import type { ItemColetado } from "./store/sources";
import { calcularRadar } from "./store/radar";
import { agrupar } from "./store/atlas";
import { dbGetAll } from "./store/db";
import { aplicarOp, criarOp, ouvirOps } from "./store/ops";
import { STORE_ANCORAS } from "./store/schema";
import type { Ancora } from "./store/schema";
import { criarViewport } from "./engine/viewport";
import { anexarInput } from "./engine/input";
import { enquadrar } from "./engine/camera";
import { criarIndiceEspacial } from "./engine/spatial-index";
import { criarVirtualizer } from "./engine/virtualizer";
import { nivelPara } from "./engine/lod";
import type { NivelLod } from "./engine/lod";
import { posicionarGirassol } from "./layout/girassol";
import { posicionarArquipelago } from "./layout/arquipelago";
import { criarPalco } from "./palco/palco";
import { MEIA_NOITE, PAPEL } from "./theme/themes";
import { aplicarTema, salvarTema, temaInicial } from "./theme/apply";
import { criarCartao, criarTileModuloBase, criarToast } from "./ui/components";
import { criarFarol } from "./ui/farol";
import type { FonteFarol, ResultadoFarol } from "./ui/farol";
import { criarHud } from "./ui/hud";
import { criarFirmamento } from "./ui/firmamento";
import { criarPainelTradutor } from "./modules/translator/panel";

const TILE_TRADUTOR_ID = "modulo:translator";

export async function iniciarShell(): Promise<void> {
  // ---- tema antes de tudo: a primeira pintura já sai na paleta certa
  let temaAtual = await temaInicial();
  aplicarTema(temaAtual);

  const firmamentoCanvas = document.getElementById(
    "firmamento",
  ) as HTMLCanvasElement;
  const viewportEl = document.getElementById("viewport") as HTMLElement;
  const mundoEl = document.getElementById("mundo") as HTMLElement;
  const hudEl = document.getElementById("hud") as HTMLElement;
  const farolEl = document.getElementById("farol-raiz") as HTMLElement;
  const palcoEl = document.getElementById("palco-raiz") as HTMLElement;
  const toastEl = document.getElementById("toast-raiz") as HTMLElement;

  const toast = criarToast(toastEl);
  const bridge = criarBridge();

  // ---- dados: coleta → radar → clusters → posições determinísticas
  const coletados = await coletar();
  const agora = Date.now();
  const abasRecentes = coletados
    .filter((item) => item.aberto)
    .map((item) => ({ dominio: item.dominio, quando: agora }));
  const radar = calcularRadar(coletados, abasRecentes);
  const { clusters, itemCluster } = agrupar(coletados, radar);

  const ancoras = new Map<string, Ancora>();
  for (const ancora of await dbGetAll<Ancora>(STORE_ANCORAS)) {
    if (!ancora.deletedAt) {
      ancoras.set(ancora.itemKey, ancora);
    }
  }

  const tiles = new Map<string, TilePlano>();
  const porItemKey = new Map<string, ItemColetado>();
  for (const item of coletados) {
    porItemKey.set(item.itemKey, item);
  }

  posicionarTudo();

  function posicionarTudo(): void {
    // Arquipélago posiciona os centroides; Girassol os itens; âncoras vencem.
    const raios = clusters.map((cluster) => ({
      id: cluster.id,
      raio: 380 * Math.sqrt(Math.max(1, cluster.itens.length)) + 200,
    }));
    const centros = posicionarArquipelago(raios, [
      { id: "deck", nome: "Deck", rect: DECK_RECT, fixo: true },
    ]);

    for (const cluster of clusters) {
      const centro = centros.get(cluster.id) ?? { x: 0, y: 0 };
      cluster.x = centro.x;
      cluster.y = centro.y;
      const livres = cluster.itens.filter((id) => !ancoras.has(id));
      const posicoes = posicionarGirassol(livres, centro, (aabb) =>
        colideComAncora(aabb),
      );
      for (const itemKey of cluster.itens) {
        const item = porItemKey.get(itemKey);
        if (!item) {
          continue;
        }
        const ancora = ancoras.get(itemKey);
        const pos = ancora ?? posicoes.get(itemKey) ?? centro;
        tiles.set(itemKey, {
          id: itemKey,
          tipo: "site",
          x: pos.x,
          y: pos.y,
          w: TILE_SITE.w,
          h: TILE_SITE.h,
          titulo: item.titulo,
          dominio: item.dominio,
          url: item.url,
          favicon: faviconDe(item.url),
          radar: radar.get(itemKey) ?? 0,
          clusterId: itemCluster.get(itemKey),
          ancorado: Boolean(ancora),
          aberto: item.aberto,
        });
      }
    }

    // Deck: tile do tradutor no centro da região fixa
    tiles.set(TILE_TRADUTOR_ID, {
      id: TILE_TRADUTOR_ID,
      tipo: "modulo",
      x: DECK_RECT.x + (DECK_RECT.w - TILE_MODULO.w) / 2,
      y: DECK_RECT.y + (DECK_RECT.h - TILE_MODULO.h) / 2,
      w: TILE_MODULO.w,
      h: TILE_MODULO.h,
      titulo: "Tradutor",
      modulo: TRANSLATOR_MODULE,
      radar: 1,
      ancorado: true,
      aberto: false,
    });
  }

  function colideComAncora(aabb: {
    x: number;
    y: number;
    w: number;
    h: number;
  }): boolean {
    for (const ancora of ancoras.values()) {
      if (
        aabb.x < ancora.x + TILE_SITE.w &&
        aabb.x + aabb.w > ancora.x &&
        aabb.y < ancora.y + TILE_SITE.h &&
        aabb.y + aabb.h > ancora.y
      ) {
        return true;
      }
    }
    return false;
  }

  // ---- engine: índice espacial + virtualização + viewport
  const indice = criarIndiceEspacial();
  for (const tile of tiles.values()) {
    indice.inserir(tile.id, { x: tile.x, y: tile.y, w: tile.w, h: tile.h });
  }

  const painelTradutor = criarPainelTradutor(bridge);
  const montados = new Map<string, HTMLElement>();

  function montarTile(id: string): void {
    const tile = tiles.get(id);
    if (!tile || montados.has(id)) {
      return;
    }
    let el: HTMLElement;
    if (tile.tipo === "modulo") {
      const base = criarTileModuloBase(
        tile.titulo,
        "play",
        painelTradutor.estadoBadge(),
      );
      painelTradutor.montar(base.corpo);
      el = base.raiz;
    } else {
      el = criarCartao(tile, tile.favicon);
      el.addEventListener("dblclick", () => mergulhar(tile.id));
      el.addEventListener("keydown", (evento) => {
        if (evento.key === "Enter") {
          mergulhar(tile.id);
        }
      });
    }
    el.style.position = "absolute";
    el.style.left = `${tile.x}px`;
    el.style.top = `${tile.y}px`;
    el.style.width = `${tile.w}px`;
    el.style.height = `${tile.h}px`;
    // contrato do input: cartões expõem data-tile-id
    el.dataset.tileId = tile.id;
    if (tile.id === selecionadoId) {
      el.classList.add("is-selecionado");
    }
    mundoEl.append(el);
    montados.set(id, el);
  }

  function desmontarTile(id: string): void {
    montados.get(id)?.remove();
    montados.delete(id);
  }

  let selecionadoId: string | null = null;

  function selecionar(id: string | null): void {
    if (selecionadoId) {
      montados.get(selecionadoId)?.classList.remove("is-selecionado");
    }
    selecionadoId = id;
    if (id) {
      montados.get(id)?.classList.add("is-selecionado");
    }
  }

  const virtualizer = criarVirtualizer({
    indice,
    montar: montarTile,
    desmontar: desmontarTile,
  });

  const viewport = criarViewport(viewportEl, mundoEl);
  const firmamento = criarFirmamento(firmamentoCanvas);

  function trocarTema(): void {
    temaAtual = temaAtual.id === MEIA_NOITE.id ? PAPEL : MEIA_NOITE;
    aplicarTema(temaAtual);
    void salvarTema(temaAtual.id);
    firmamento.releTema();
  }

  const hud = criarHud(hudEl, {
    aoTrocarTema: trocarTema,
    aoIrParaDeck: () => irParaDeck(),
  });

  let nivelAtual: NivelLod = "z1";
  let palcoAberto = false;

  viewport.onLente((lente: Lente) => {
    virtualizer.aoLente(lente, {
      w: viewportEl.clientWidth,
      h: viewportEl.clientHeight,
    });
    firmamento.atualizarLente(lente);
    const nivel = nivelPara(lente.s, nivelAtual);
    if (nivel !== nivelAtual) {
      nivelAtual = nivel;
      firmamento.modoNivel(nivel);
      mundoEl.classList.toggle("nivel-z0", nivel === "z0");
    }
    hud.atualizar(lente, palcoAberto ? "palco" : nivelAtual);
  });

  // ---- Palco
  const palco = criarPalco(palcoEl, {
    aoFechar: () => {
      palcoAberto = false;
      hud.atualizar(viewport.lente(), nivelAtual);
    },
    aoAbrirEmAba: (url: string) => {
      void chrome.tabs.create({ url });
    },
    aoAncorar: (tileId: string) => {
      void ancorarTile(tileId);
    },
  });

  function mergulhar(tileId: string): void {
    const tile = tiles.get(tileId);
    if (!tile || tile.tipo !== "site") {
      return;
    }
    const el = montados.get(tileId);
    const rect = el?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    palcoAberto = true;
    palco.abrir(tile, rect);
    hud.atualizar(viewport.lente(), "palco");
  }

  async function ancorarTile(tileId: string): Promise<void> {
    const tile = tiles.get(tileId);
    if (!tile) {
      return;
    }
    await aplicarOp(
      criarOp("ancorar", { itemKey: tileId, x: tile.x, y: tile.y }),
    );
    tile.ancorado = true;
    toast("Tile ancorado — o layout automático não o move mais.", "ok");
  }

  function irParaDeck(): void {
    void viewport.animarPara(
      enquadrar(DECK_RECT, {
        w: viewportEl.clientWidth,
        h: viewportEl.clientHeight,
      }),
      260,
    );
  }

  // ---- input
  function subirNivel(): void {
    if (palco.estaAberto()) {
      palco.fechar();
      return;
    }
    const todos = [...tiles.values()];
    const minX = Math.min(...todos.map((tile) => tile.x));
    const minY = Math.min(...todos.map((tile) => tile.y));
    const maxX = Math.max(...todos.map((tile) => tile.x + tile.w));
    const maxY = Math.max(...todos.map((tile) => tile.y + tile.h));
    void viewport.animarPara(
      enquadrar(
        { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
        { w: viewportEl.clientWidth, h: viewportEl.clientHeight },
      ),
      260,
    );
  }

  function abrirEmAba(tileId: string): void {
    const tile = tiles.get(tileId);
    if (tile?.url) {
      void chrome.tabs.create({ url: tile.url });
    }
  }

  anexarInput(viewportEl, {
    lente: () => viewport.lente(),
    definirLente: (lente: Lente) => viewport.definirLente(lente),
    iniciarInteracao: () => viewport.iniciarInteracao(),
    encerrarInteracao: () => viewport.encerrarInteracao(),
    tilesVisiveis: () =>
      [...montados.keys()]
        .map((id) => tiles.get(id))
        .filter((tile): tile is TilePlano => Boolean(tile)),
    selecionado: () => selecionadoId,
    selecionar,
    mergulhar,
    subirNivel,
    irParaDeck,
    abrirEmAba,
  });

  // ---- Farol
  const fonteItens: FonteFarol = {
    buscar: (q: string): ResultadoFarol[] => {
      const todos = [...tiles.values()].filter((tile) => tile.tipo === "site");
      const base = q
        ? todos
        : [...todos].sort((a, b) => b.radar - a.radar).slice(0, 12);
      return base.map((tile) => ({
        id: tile.id,
        titulo: tile.titulo,
        detalhe: tile.dominio,
        radar: tile.radar,
        acao: () => mergulhar(tile.id),
        acaoAlternativa: () => {
          if (tile.url) {
            void chrome.tabs.create({ url: tile.url });
          }
        },
      }));
    },
  };
  const fonteComandos: FonteFarol = {
    prefixo: ">",
    buscar: (): ResultadoFarol[] => [
      {
        id: "cmd-deck",
        titulo: "Ir para o Deck",
        atalho: "Cmd+0",
        acao: irParaDeck,
      },
      {
        id: "cmd-tema",
        titulo: "Alternar tema (Meia-noite/Papel)",
        acao: trocarTema,
      },
      {
        id: "cmd-parar",
        titulo: "Tradutor: parar legendas",
        acao: () => {
          void bridge.comandar(TRANSLATOR_MODULE, "stop");
        },
      },
      {
        id: "cmd-historico",
        titulo: "Ativar histórico (90 dias) no mapa",
        acao: () => {
          void pedirHistorico().then((concedido) => {
            toast(
              concedido
                ? "Histórico ativado — recarregue o Luna para reindexar."
                : "Permissão de histórico não concedida.",
              concedido ? "ok" : "err",
            );
          });
        },
      },
    ],
  };

  criarFarol(farolEl, [fonteItens, fonteComandos]);

  // ---- convergência entre instâncias: outra aba do Luna aplicou uma op
  ouvirOps(() => {
    // v1: âncora nova em outra instância só é refletida no próximo boot; o
    // recálculo ao vivo entra com o layout incremental (F5).
  });

  // ---- primeira cena: constelação aquecida pelo Radar, depois Deck
  firmamento.aquecer(
    clusters.map((cluster: ClusterPlano) => ({
      x: cluster.x,
      y: cluster.y,
      peso: Math.max(0.2, ...cluster.itens.map((id) => radar.get(id) ?? 0)),
    })),
  );
  irParaDeck();
}
