// Farol — command palette do Luna (Cmd+K). Providers plugáveis (FonteFarol):
// itens, abas, comandos (>), Lugares (@), filtros (#) — e, na fase nuvem,
// dispositivos remotos entram como fonte nova sem tocar este arquivo.

export interface ResultadoFarol {
  id: string;
  titulo: string;
  detalhe?: string;
  atalho?: string;
  radar?: number; // R(i) ∈ [0,1] — desempata o ranking
  acao(): void;
  // Cmd+Enter (ex.: abrir em aba real em vez de Mergulho)
  acaoAlternativa?(): void;
}

export interface FonteFarol {
  // sem prefixo = busca geral (itens/abas); com prefixo só responde a ele
  prefixo?: ">" | "@" | "#";
  buscar(q: string): ResultadoFarol[];
}

export interface Farol {
  abrir(): void;
  fechar(): void;
  estaAberto(): boolean;
  destruir(): void;
}

const PREFIXOS = [">", "@", "#"] as const;
const LIMITE_RESULTADOS = 12;

/* ------------------------------------------------------------ scorer fuzzy */

// Dobra uma string para comparação: 1 code point → 1 célula, minúscula e sem
// acento (NFD e fica só a base). Manter o comprimento preserva os índices
// para o destaque com <mark> sobre o texto original.
function dobrar(texto: string): string[] {
  return [...texto].map((c) => (c.normalize("NFD")[0] ?? c).toLowerCase());
}

const SEPARADORES = new Set([" ", "-", "_", ".", "/", ":", "(", "["]);

interface Casamento {
  nota: number; // 0..1
  indices: number[]; // code points casados no alvo (para o <mark>)
}

// Casamento por subsequência, guloso da esquerda para a direita.
// Pontos por char casado: 1, +8 em início de palavra, +4 consecutivo ao
// casamento anterior; penalidade de 0.5 por char pulado (gap), com piso 0.25.
// Normalizado por (n · 13) — 13 é o máximo por char — para ficar em 0..1.
function casar(q: string, alvo: string): Casamento | null {
  const agulha = dobrar(q);
  const palheiro = dobrar(alvo);
  if (agulha.length === 0) return { nota: 0, indices: [] };

  let nota = 0;
  let desde = 0;
  let anterior = -2;
  const indices: number[] = [];
  for (const ch of agulha) {
    if (ch === " ") continue; // espaço na query só separa termos
    const k = palheiro.indexOf(ch, desde);
    if (k < 0) return null;
    let pontos = 1;
    if (k === 0 || SEPARADORES.has(palheiro[k - 1] ?? "")) pontos += 8;
    if (k === anterior + 1) pontos += 4;
    const gap = k - desde;
    nota += Math.max(0.25, pontos - gap * 0.5);
    indices.push(k);
    anterior = k;
    desde = k + 1;
  }
  if (indices.length === 0) return { nota: 0, indices };
  return { nota: Math.min(1, nota / (indices.length * 13)), indices };
}

// Score lexical puro em 0..1 (exportado para testes e para outras fontes).
export function fuzzy(q: string, alvo: string): number {
  return casar(q, alvo)?.nota ?? 0;
}

/* ----------------------------------------------------------------- criação */

export function criarFarol(raiz: HTMLElement, fontes: FonteFarol[]): Farol {
  const veu = document.createElement("div");
  veu.className = "farol-veu";
  veu.hidden = true;

  const caixa = document.createElement("div");
  caixa.className = "farol";
  caixa.hidden = true;

  const entrada = document.createElement("input");
  entrada.className = "farol-entrada";
  entrada.type = "text";
  entrada.setAttribute("role", "combobox");
  entrada.setAttribute("aria-expanded", "false");
  entrada.setAttribute("aria-autocomplete", "list");
  entrada.setAttribute("aria-controls", "farol-lista");
  entrada.setAttribute("aria-label", "Buscar no Luna");
  entrada.placeholder =
    "Busque qualquer coisa — > comandos · @ lugares · # filtros";

  const lista = document.createElement("ul");
  lista.className = "farol-lista";
  lista.id = "farol-lista";
  lista.setAttribute("role", "listbox");
  lista.setAttribute("aria-label", "Resultados");

  caixa.append(entrada, lista);
  raiz.append(veu, caixa);

  let aberto = false;
  let ativo = 0;
  let exibidos: ResultadoFarol[] = [];
  let focoAnterior: HTMLElement | null = null;

  // Título com os chars casados envoltos em <mark> (agrupando consecutivos).
  function comMarcas(titulo: string, indices: number[]): Node[] {
    const casados = new Set(indices);
    const nos: Node[] = [];
    let trecho = "";
    let marcado = false;
    const despejar = (): void => {
      if (!trecho) return;
      if (marcado) {
        const marca = document.createElement("mark");
        marca.textContent = trecho;
        nos.push(marca);
      } else {
        nos.push(document.createTextNode(trecho));
      }
      trecho = "";
    };
    [...titulo].forEach((c, i) => {
      if (casados.has(i) !== marcado) {
        despejar();
        marcado = casados.has(i);
      }
      trecho += c;
    });
    despejar();
    return nos;
  }

  function marcarAtivo(): void {
    const opcoes = lista.querySelectorAll<HTMLElement>('[role="option"]');
    opcoes.forEach((opcao, i) => {
      opcao.classList.toggle("is-ativo", i === ativo);
      opcao.setAttribute("aria-selected", String(i === ativo));
    });
    const alvo = opcoes[ativo];
    if (alvo) {
      entrada.setAttribute("aria-activedescendant", alvo.id);
      alvo.scrollIntoView({ block: "nearest" });
    } else {
      entrada.removeAttribute("aria-activedescendant");
    }
  }

  function executar(alternativa: boolean): void {
    const resultado = exibidos[ativo];
    if (!resultado) return;
    fechar();
    if (alternativa && resultado.acaoAlternativa) resultado.acaoAlternativa();
    else resultado.acao();
  }

  function atualizar(): void {
    const bruto = entrada.value;
    const prefixo = PREFIXOS.find((p) => bruto.startsWith(p));
    const termo = (prefixo ? bruto.slice(1) : bruto).trim();
    const aplicaveis = fontes.filter((fonte) => fonte.prefixo === prefixo);

    const pontuados: {
      resultado: ResultadoFarol;
      nota: number;
      indices: number[];
    }[] = [];
    for (const fonte of aplicaveis) {
      for (const resultado of fonte.buscar(termo)) {
        if (termo === "") {
          // Query vazia = recentes: a fonte já devolve na ordem certa.
          pontuados.push({ resultado, nota: 0, indices: [] });
          continue;
        }
        const casamento = casar(termo, resultado.titulo);
        if (!casamento) continue;
        // Ranking: 0.55·lex + 0.10·radar. Os 0.35 restantes são do score
        // semântico (cosseno de embedding via intel, F7) — quando chegar,
        // soma aqui sem mudar interface nenhuma.
        pontuados.push({
          resultado,
          nota: 0.55 * casamento.nota + 0.1 * (resultado.radar ?? 0),
          indices: casamento.indices,
        });
      }
    }
    if (termo !== "") pontuados.sort((a, b) => b.nota - a.nota);
    const topo = pontuados.slice(0, LIMITE_RESULTADOS);
    exibidos = topo.map((p) => p.resultado);

    lista.replaceChildren();
    if (topo.length === 0) {
      const vazio = document.createElement("li");
      vazio.className = "farol-vazio";
      vazio.setAttribute("role", "presentation");
      vazio.textContent =
        termo === "" ? "Aperte Cmd+K e busque qualquer coisa" : "Nada por aqui";
      lista.append(vazio);
    }
    topo.forEach((p, i) => {
      const item = document.createElement("li");
      item.className = "farol-resultado";
      item.id = `farol-op-${i}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", "false");

      const titulo = document.createElement("span");
      titulo.className = "farol-titulo";
      titulo.append(...comMarcas(p.resultado.titulo, p.indices));
      item.append(titulo);

      if (p.resultado.detalhe) {
        const detalhe = document.createElement("span");
        detalhe.className = "farol-detalhe";
        detalhe.textContent = p.resultado.detalhe;
        item.append(detalhe);
      }
      if (p.resultado.atalho) {
        const atalho = document.createElement("span");
        atalho.className = "farol-atalho";
        atalho.textContent = p.resultado.atalho;
        item.append(atalho);
      }
      item.addEventListener("pointerenter", () => {
        ativo = i;
        marcarAtivo();
      });
      item.addEventListener("click", () => {
        ativo = i;
        executar(false);
      });
      lista.append(item);
    });

    ativo = 0;
    marcarAtivo();
  }

  function mover(delta: number): void {
    if (exibidos.length === 0) return;
    ativo = (ativo + delta + exibidos.length) % exibidos.length;
    marcarAtivo();
  }

  function abrir(): void {
    if (aberto) return;
    aberto = true;
    focoAnterior =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    veu.hidden = false;
    caixa.hidden = false;
    entrada.setAttribute("aria-expanded", "true");
    entrada.value = "";
    atualizar();
    entrada.focus();
  }

  function fechar(): void {
    if (!aberto) return;
    aberto = false;
    veu.hidden = true;
    caixa.hidden = true;
    entrada.setAttribute("aria-expanded", "false");
    focoAnterior?.focus();
    focoAnterior = null;
  }

  // Listener global: Cmd+K alterna (Ctrl+K fora do macOS); Esc fecha.
  const aoTeclarGlobal = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (aberto) fechar();
      else abrir();
      return;
    }
    if (e.key === "Escape" && aberto) {
      e.preventDefault();
      fechar();
    }
  };
  window.addEventListener("keydown", aoTeclarGlobal);

  entrada.addEventListener("input", atualizar);
  entrada.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      mover(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      mover(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      executar(e.metaKey || e.ctrlKey);
    }
  });
  veu.addEventListener("click", fechar);

  return {
    abrir,
    fechar,
    estaAberto: () => aberto,
    destruir() {
      window.removeEventListener("keydown", aoTeclarGlobal);
      veu.remove();
      caixa.remove();
    },
  };
}
