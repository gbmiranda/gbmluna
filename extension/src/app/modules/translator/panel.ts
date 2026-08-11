// Tile do tradutor no Deck: estado do host, idiomas, abas audíveis, parar
// sessão e transcript das legendas ao vivo (docs/twoddd.md, "Tradutor
// unificado"). O start nasce de gesto (popup/menu de contexto) — daqui o
// usuário foca a aba para completar o gesto.
import type { Bridge } from "../../bridge";
import { TRANSLATOR_MODULE } from "../../../protocol";
import type { PingHostResult } from "../../../protocol";
import { ehExtensao } from "../../previa";
import { criarBadge, criarBotao } from "../../ui/components";
import type { EstadoBadge, EstadoModulo } from "../../ui/components";

const MAX_LINHAS_TRANSCRIPT = 50;

type EstadoTile = "inativo" | "preparando" | "ativo" | "erro";

const BADGE_POR_ESTADO: Record<EstadoTile, EstadoBadge> = {
  inativo: "neutro",
  preparando: "warn",
  ativo: "ok",
  erro: "err",
};

export interface PainelTradutor {
  montar(corpo: HTMLElement): void;
  estado(): EstadoTile;
  estadoBadge(): EstadoModulo;
}

export function criarPainelTradutor(bridge: Bridge): PainelTradutor {
  let estadoAtual: EstadoTile = "inativo";
  let corpoEl: HTMLElement | null = null;
  let statusEl: HTMLElement | null = null;
  let transcriptEl: HTMLElement | null = null;
  let parcialEl: HTMLElement | null = null;
  let badgeEl: HTMLElement | null = null;
  let botaoParar: HTMLButtonElement | null = null;

  function definirEstado(novo: EstadoTile): void {
    estadoAtual = novo;
    if (!badgeEl || !botaoParar) {
      return;
    }
    badgeEl.replaceWith((badgeEl = criarBadge(BADGE_POR_ESTADO[novo], novo)));
    botaoParar.disabled = novo === "inativo";
  }

  function mostrarStatus(mensagem: string): void {
    if (statusEl) {
      statusEl.textContent = mensagem;
    }
  }

  function adicionarFinal(texto: string, traduzido: string | null): void {
    if (!transcriptEl) {
      return;
    }
    const linha = document.createElement("p");
    linha.className = "transcript-linha";
    linha.textContent = traduzido ?? texto;
    transcriptEl.append(linha);
    while (transcriptEl.childElementCount > MAX_LINHAS_TRANSCRIPT) {
      transcriptEl.firstElementChild?.remove();
    }
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
    if (parcialEl) {
      parcialEl.textContent = "";
    }
  }

  async function listarAbasAudiveis(listaEl: HTMLElement): Promise<void> {
    if (!ehExtensao()) {
      const dica = document.createElement("p");
      dica.className = "painel-dica";
      dica.textContent =
        "Modo prévia: abra o Luna pela extensão para legendar.";
      listaEl.append(dica);
      return;
    }
    const abas = await chrome.tabs.query({ audible: true });
    listaEl.textContent = "";
    if (abas.length === 0) {
      const vazio = document.createElement("p");
      vazio.className = "painel-dica";
      vazio.textContent =
        "Nenhuma aba com áudio. Para legendar: abra o vídeo e use o menu de contexto ou o ícone da extensão.";
      listaEl.append(vazio);
      return;
    }
    for (const aba of abas) {
      if (aba.id === undefined) {
        continue;
      }
      const tabId = aba.id;
      const item = criarBotao(`▸ ${aba.title ?? "aba"}`, "fantasma", () => {
        void bridge.comandar(TRANSLATOR_MODULE, "focar-aba", { tabId });
      });
      item.classList.add("painel-aba");
      listaEl.append(item);
    }
  }

  function montar(corpo: HTMLElement): void {
    // Idempotência: remontar o tile não duplica conteúdo nem listeners de DOM.
    if (corpoEl === corpo && corpo.childElementCount > 0) {
      return;
    }
    corpoEl = corpo;
    corpo.textContent = "";

    const topo = document.createElement("div");
    topo.className = "painel-topo";
    badgeEl = criarBadge(BADGE_POR_ESTADO[estadoAtual], estadoAtual);
    topo.append(badgeEl);

    const host = document.createElement("span");
    host.className = "painel-host";
    if (ehExtensao()) {
      host.textContent = "host: verificando…";
      void chrome.runtime
        .sendMessage({ cmd: "ping-host" })
        .then((resultado: PingHostResult) => {
          host.textContent = resultado.ok
            ? `host v${resultado.hostVersion}`
            : "host indisponível";
        });
    } else {
      host.textContent = "modo prévia";
    }
    topo.append(host);

    const abasEl = document.createElement("div");
    abasEl.className = "painel-abas";
    void listarAbasAudiveis(abasEl);

    botaoParar = criarBotao("Parar legendas", "perigo", () => {
      void bridge.comandar(TRANSLATOR_MODULE, "stop");
    });
    botaoParar.disabled = true;

    statusEl = document.createElement("p");
    statusEl.className = "painel-status";
    statusEl.textContent = "—";

    transcriptEl = document.createElement("div");
    transcriptEl.className = "transcript";
    transcriptEl.setAttribute("aria-live", "polite");

    parcialEl = document.createElement("p");
    parcialEl.className = "transcript-linha parcial";

    corpo.append(topo, abasEl, botaoParar, statusEl, transcriptEl, parcialEl);
  }

  bridge.aoEvento((evento) => {
    if (evento.module !== TRANSLATOR_MODULE) {
      return;
    }
    switch (evento.type) {
      case "partial":
        if (parcialEl) {
          parcialEl.textContent = String(evento.payload.text ?? "");
        }
        definirEstado("ativo");
        break;
      case "final":
        adicionarFinal(
          String(evento.payload.text ?? ""),
          evento.payload.translated === null
            ? null
            : String(evento.payload.translated),
        );
        definirEstado("ativo");
        break;
      case "status":
        mostrarStatus(String(evento.payload.message ?? ""));
        definirEstado("preparando");
        break;
      case "error":
        mostrarStatus(`Erro: ${String(evento.payload.message ?? "")}`);
        definirEstado("erro");
        break;
      case "cleared":
        mostrarStatus("Sessão encerrada.");
        definirEstado("inativo");
        break;
    }
  });

  bridge.aoEstado((translator) => {
    if (translator.capturing) {
      definirEstado("ativo");
      mostrarStatus("Legendas ativas.");
    } else if (estadoAtual !== "erro") {
      definirEstado("inativo");
    }
  });

  return {
    montar,
    estado: () => estadoAtual,
    estadoBadge: () => ({
      tipo: BADGE_POR_ESTADO[estadoAtual],
      rotulo: estadoAtual,
    }),
  };
}
