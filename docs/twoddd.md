# twoDDD — Luna, o shell espacial do gbml

> Plano mestre sintetizado (2026-08-11). Estado atual no [README](../README.md); visão de
> produto em [visao.md](visao.md); identidade visual em [design-system.md](design-system.md).
> **Meta v1: funcional no macOS. Multiplataforma vem depois (visao.md fase 2+).**

## O que é

**Luna** é a interface twoDDD do gbml: um plano infinito 2D (pan) com profundidade 3D
(zoom semântico) que organiza tudo que o usuário acessa — sites, apps, módulos gbml —
para ele **nunca sair do app**. Design tokenizado com temas estilo VSCode; organização,
busca e filtro guiados pelo contexto do usuário, processado localmente (Neural Engine
via host Swift). O tradutor existente é o primeiro módulo unificado no Deck.

## Vocabulário canônico (usado no código)

| Nome | O que é |
|---|---|
| **Plano** | Canvas infinito 2D; coordenadas em *wu* (world units; 1 wu = 1 CSS px em s=1) |
| **Lente** | Câmera `{x, y, s}`; `s ∈ [0.02, 4]` |
| **Tile** | Item no Plano: `site` (320×200 wu) ou `modulo` (320×400 wu) |
| **Girassol** | Layout filotáxico dos tiles dentro de um cluster (`r=380·√i`, `θ=i·137.508°`) |
| **Arquipélago** | Layout força-dirigida dos centroides de cluster (determinístico, seed 42) |
| **Âncora** | Posição manual de um tile — o layout automático nunca a move, desvia dela |
| **Lugar** | Região nomeada do Plano (Deck, Trabalho, Pessoal, Mídia) |
| **Deck** | Lugar fixo na origem: central de controle dos módulos gbml (`Cmd+0`) |
| **Palco** | Overlay full-screen com iframe real e interativo (o "z2") |
| **Mergulho** | Transição cartão → Palco (FLIP, 260 ms, ease-out) |
| **Atlas** | Engine de contexto: coleta → normalização → embedding → cluster → rótulo |
| **Radar** | Score contínuo de relevância contextual R(i) ∈ [0,1] |
| **Farol** | Command palette (`Cmd+K`) |
| **Trilho** | Renderer responsivo para telas pequenas/touch (v2) |
| **intel** | Módulo do host Swift: embeddings locais no Neural Engine |
| **Firmamento** | Camada de fundo viva: milhares de pixels RGB individuais (estilo painel OLED) pulsando em ondas sincronizadas; a cena gigante 8-bit sobre a qual o Plano existe |

**Regra de ouro:** estado derivável nunca é persistido como verdade. Posições
automáticas, clusters e vetores são recomputáveis deterministicamente (idempotência e
sync barato). Persistem: itens conhecidos, âncoras, Lugares, atribuições, temas, prefs.

## Arquitetura

```
┌─ Chrome ──────────────────────────────────────────────────────────┐
│ app.html (Luna)  popup (launcher)  content.ts (overlay legendas)  │
│    │ porta longa "gbml-shell"          ▲                          │
│    ▼                                   │                          │
│ background/ ── shell-hub ── translator-session ── native-bridge ──┼── gbml-host
│               (broadcast)   (captura/gesto)      (PortaUnica,     │   (Swift)
│                                                   envelope)       │   ModuleRouter
└───────────────────────────────────────────────────────────────────┘    ├ translator
                                                                         └ intel (F7)
```

### Estrutura de arquivos

```
extension/src/
  protocol.ts              # barrel: re-exporta protocol/* (compat)
  protocol/{envelope,translator,shell,intel}.ts
  background.ts            # entry fino → background/index
  background/{index,native-bridge,translator-session,shell-hub,shell-window,
              context-menu,dnr}.ts
  app.ts                   # entry do shell → dist/app.js
  app/
    shell.ts               # bootstrap: store → engine → ui → bridge
    bridge.ts              # RPC porta longa (requestId/ack, reconexão idempotente)
    engine/{camera,viewport,input,lod,spatial-index,virtualizer}.ts
    layout/{girassol,arquipelago}.ts
    palco/palco.ts         # overlay iframe + pool LRU(3) + fallback
    modules/{registry.ts,translator/panel.ts}
    store/{schema,db,ops,sources,radar}.ts
    theme/{tokens,themes,apply}.ts
    ui/{toolbar,farol,constellation,components}.ts
host/Sources/GbmlHost/
  Module.swift ModuleRouter.swift Modules/TranslatorModule.swift
  Modules/IntelModule.swift (F7)
```

## Zoom semântico (o "DDD")

| Nível | Entra | Sai | Renderiza |
|---|---|---|---|
| **z0 Constelação** | `s ≤ 0.20` | `s ≥ 0.24` | Canvas 2D screen-space: pontos (raio `4+6·R` px), blobs de cluster (hull + 12% alpha), rótulos fixos 12 px. DOM oculto |
| **z1 Cartões** | `0.24 ≤ s` | `s < 0.20` | Cartões DOM: favicon, título, domínio, brilho por Radar (`opacity: 0.45+0.55·R`) |
| **z2 Palco** | zoom cruza `s ≥ 1.5` sobre um tile, Enter ou duplo-clique | Esc / fechar | Overlay fixo fora do Plano: iframe real + header (URL, abrir na aba, ancorar, fechar) |

- **Firmamento** (todas as profundidades): canvas 2D atrás do `#mundo` com parallax
  0.6×; ~3.000 pixels (quadrados 2×2/3×3) em typed arrays, cada um com RGB próprio;
  brilho = onda de respiração global (fase senoidal por posição — o "acende e apaga
  sincronizado") + twinkle + calor do Radar próximo + ondulação de interação no
  pan/zoom. No z0 é protagonista (constelação/cena); no z1+ recua (40% do brilho).
  Tick de 30 fps próprio, pausa com aba oculta, estático com `prefers-reduced-motion`.
  Filtros ativos escurecem as regiões que não casam (a cena "responde" à busca).
  Rotação de câmera: fora da v1 (gesto de girar entra com o Trilho/touch, v2).
- Histerese z0↔z1 (banda 0.20–0.24) elimina flicker; ao sair do Palco, `s := min(s, 1.3)`.
- **Palco é overlay, não escala de iframe** — iframe escalado por CSS = blur + bugs de
  input. O Mergulho anima o retângulo do cartão até full-screen (FLIP); a Lente não muda.
- Orçamentos: ≤ **250 cartões DOM** no viewport (acima disso o renderer força z0 local);
  pool de **3 iframes** (LRU; suspenso = removido do DOM); spatial hash com célula 1024 wu;
  budget 8 ms de script/frame; um único `#mundo` com `translate3d+scale` (compositor-only).
- Input: wheel = pan; `ctrl+wheel` (pinça do trackpad) = zoom ancorado no cursor
  (`s' = s·1.0018^(−deltaY)`); drag com pointer capture; 2 ponteiros = pinch.
- Teclado: `Cmd+K` Farol · setas = seleção espacial (cone ±60°) · Enter = Mergulho ·
  Esc = sobe um nível (Palco → cluster → z0) · `Cmd+0` Deck · `Cmd+1..9` Lugares ·
  `Cmd+±` zoom · `Cmd+Enter` abre em aba real.

## Organização espacial

- **Arquipélago**: força-dirigida sobre centroides (N ≤ 24, Worker, 300 iterações, ordem
  fixa, PRNG seed 42 → mesmo input ⇒ mesmo layout). Cluster atribuído a um Lugar recebe
  mola (0.2) para o retângulo do Lugar.
- **Girassol**: itens do cluster ordenados por Radar; espiral áurea (espaçamento 380 wu ⇒
  sem sobreposição por construção). Slot que colide com Âncora é pulado.
- **Âncoras**: arrastar tile grava `{x, y, lugarId?}` e o tira do layout automático até
  "soltar âncora". Arrastar para dentro de um Lugar também vira sinal `dominio→lugar`
  para o Atlas.
- **Lugares seed**: Deck (fixo, origem, `1200×800`), Trabalho, Pessoal, Mídia.

## Atlas e Radar

**v1 (heurístico, sem host):** coleta `chrome.topSites` + `chrome.tabs` + (opt-in)
`chrome.history` 90 d / 5.000 resultados; URL canônica sem `utm_*`/fragmento;
`itemKey = sha256(urlCanonica)` (estável entre devices); clusters por domínio dominante
com rótulo = marca do domínio; TF-IDF de títulos para o resto.

**Radar:** `R(i) = 0.30·F + 0.25·Rec + 0.20·H + 0.15·S + 0.10·A`
(F = frequência log-normalizada; Rec = `2^(−Δh/72)`; H = histograma hábito 7×24
suavizado, top-500, neutro 0.3 sem dado; S = similaridade com a sessão — v1: mesmo
domínio/cluster das abas dos últimos 30 min, com intel vira cosseno de embedding;
A = 1 se aberto em aba). Recalcula a cada 5 min e em `tabs.onActivated`.

**F7 (intel):** módulo Swift stateless com `NLContextualEmbedding` (dim 512, Neural
Engine): `{module:"intel", type:"embed", requestId, items:[{id,text}]}` (lotes ≤ 32) →
`{type:"embedded", modelo:"nlce-v1", vectors:[{id, v:base64Float32}]}`. Vetores em
IndexedDB (ArrayBuffer contíguo); k-médias esféricas num Worker (k = `clamp(⌈√(N/2)⌉,
6, 24)`, seed fixa); rotulagem TF-IDF; busca semântica no Farol. `modelo` versionado ⇒
reindexação idempotente.

## Farol

Providers plugáveis (`FonteFarol`): itens, abas, comandos (`>`), Lugares (`@`), filtros
(`#quente`, `#hoje`, `#aberto`, `#cluster:X`); dispositivos remotos entram como provider
na fase nuvem sem tocar o Farol. Ranking `0.55·lex + 0.35·sem + 0.10·R` (lex = fuzzy por
subsequência com bônus de início de palavra/consecutivo; sem = cosseno, ≥ 3 chars,
debounce 150 ms, só com intel). Enter = Mergulho; `Cmd+Enter` = aba real.

## Protocolo modular (F0 — fase 1 do visao.md antecipada)

```jsonc
{ "module": "translator", "type": "start", "requestId": "r1", "targetLanguage": "pt-BR" }
{ "module": "core", "type": "pong", "hostVersion": "0.2.0", "modules": ["translator"] }
```

- `protocol.ts` vira barrel; tipos atuais migram para `protocol/translator.ts` sem
  mudança de payload; `envelope.ts` define `ModuleEnvelope {module, type, requestId?}`.
- Swift: `HostModule` (protocol) + `ModuleRouter`; `TranslatorModule` absorve os handlers
  do `HostRuntime`, que vira parser + roteador com **fallback flat por conexão**
  (primeira mensagem decide o modo) — host novo funciona com extensão velha e com o
  `host-smoke` atual. `host-smoke` ganha `--envelope` e roda nos dois modos.
- Background: **PortaUnica** (`native-bridge.ts`) — uma porta nativa multiplexada por
  envelope + `requestId` (timeout 10 s), reconexão com backoff 500 ms→4 s, estado mínimo
  em `chrome.storage.session` (sobrevive à morte do service worker MV3).
- Idempotência dos comandos: `start` idêntico com sessão ativa → `ok` (no-op); `stop` sem
  sessão → `ok`; `openShell()` foca janela existente antes de criar.

## Tradutor unificado (Deck)

- Tile `modulo:"translator"` no Deck: selects de idioma (mesmas chaves de storage do
  popup), lista de abas audíveis, Iniciar/Parar, indicador do host, transcript das
  últimas 50 legendas (parcial em itálico, final com tradução).
- **Restrição real do Chrome**: `tabCapture.getMediaStreamId` exige extensão *invocada*
  na aba (gesto). Start nasce do popup ("Legendar esta aba") ou do context menu novo;
  o shell exibe, controla parâmetros e **para** a sessão. Atalho no tile foca a aba para
  o usuário completar o gesto.
- `translator-session.ts` emite para o content script (como hoje) **e** para o
  `shell-hub` (broadcast às portas `gbml-shell`). Popup encolhe para launcher (~60
  linhas): "Abrir Luna", status, start/stop rápido.

## Persistência (IndexedDB, schema v1)

```ts
interface Persisted { id: string; createdAt: number; updatedAt: number;
                      rev: number; deviceId: string; deletedAt?: number } // tombstone
interface ItemConhecido extends Persisted { itemKey: string; url: string; titulo: string;
  visitas: number; ultimaVisita: number; embedMode: "card"|"iframe"|"tab-only" }
interface Ancora extends Persisted { itemKey: string; x: number; y: number; lugarId?: string }
interface Lugar extends Persisted { nome: string; cor: string;
  rect: {x:number;y:number;w:number;h:number}; regra?: {dominios?: string[]; rotulos?: string[]} }
interface TemaDef { id: string; nome: string; tipo: "dark"|"light"; builtIn: boolean;
  tokens: Record<string, string> }
```

- Toda mutação passa por `applyOp(op)` com `opId` (reaplicar = no-op; janela de dedupe
  de 1.000 ops); `BroadcastChannel("gbml-store")` converge instâncias; conflito = LWW
  (maior `updatedAt`, empate por `deviceId`). Esse formato é o que o sync da nuvem
  (visao.md fase 3) vai consumir sem retrabalho.
- Caches deriváveis (vetores, clusters, histogramas) ficam em stores próprios com versão
  de modelo — invalidar = recomputar, nunca corromper.

## Segurança

- Permissões incrementais: shell básico `topSites`+`favicon`; tradutor `tabs`+
  `contextMenus`; histórico `optional_permissions:["history"]` (pedida ao ativar);
  embed profundo `declarativeNetRequest` + `optional_host_permissions:["<all_urls>"]`
  **só na fase DNR (v2), opt-in com explicação**.
- v1 do Palco: **sem** remoção de headers — iframe direto; detecção de bloqueio (timeout
  4 s sem `load`) → fallback honesto "abrir na aba" + `embedMode:"tab-only"` persistido.
- Fase DNR (v2): regras de **sessão** escopadas a `tabIds` do shell + `sub_frame` apenas,
  blocklist do usuário (bancos etc.), update convergente (`removeRuleIds` + `addRules`).
- Iframes sempre com `sandbox` **sem `allow-top-navigation`** (anti frame-busting),
  `referrerpolicy="strict-origin-when-cross-origin"`.
- **Nunca**: modifyHeaders em `main_frame` ou fora dos tabs do shell; `<all_urls>` na
  instalação; persistir/enviar conteúdo de página para fora da máquina; injetar script
  em site embutido. Inteligência roda local (Neural Engine), como o tradutor.

## Atributos → mecanismos (CLAUDE.md)

| Atributo | Mecanismo concreto |
|---|---|
| Modularização | Envelope `{module,type}`; `ModuleRouter` Swift; `ModuloTile`/`FonteFarol` plugáveis; renderers Plano/Trilho atrás da mesma interface |
| Reutilização | `protocol.ts` fonte única; Palco único (desktop e Trilho); storage de idiomas compartilhado popup/tile |
| Idempotência | `applyOp(opId)`; layout determinístico (seed fixa); `openShell` foca antes de criar; start/stop tolerantes; regras DNR convergentes; reindexação por `itemKey+modelo` |
| Robustez | Fallback flat por conexão; reconexão com backoff; estado em `storage.session` (SW MV3 morre e volta); falha de tile/iframe contida com fallback honesto |
| Segurança | Permissões mínimas incrementais e opcionais; sandbox sem top-navigation; local-first |
| Performance | Transform único compositor-only; virtualização + spatial hash; ≤ 250 cartões; pool 3 iframes; Palco em vez de iframe escalado; workers para layout/vetores |
| Eficiência | Zero deps de runtime; Canvas 2D (não WebGL) no z0; base64 Float32 nos lotes; debounce 300 ms nas escritas |
| Inteligência | Radar (F/Rec/H/S/A); clusters + rótulos locais; busca semântica; heurística primeiro, embedding depois |

## Fases e critérios de pronto

Verificação padrão de toda fase: `npm run typecheck && npm run build` + `swift build`
(se host mudou) + `host-smoke` (flat **e** `--envelope`) + roteiro manual da fase.

| Fase | Entrega | Pronto quando |
|---|---|---|
| **F0** | Protocolo modular dual-mode (TS + Swift) + `host-smoke --envelope` | smoke verde nos 2 modos; tradutor manual OK no YouTube |
| **F1** | Shell mínimo: Lente, pan/zoom, cartões (topSites+abas), tema Meia-noite, `openShell` | 60 fps com 200 cartões (`?seed=200`); zoom no cursor sem deriva; 3 cliques = 1 janela |
| **F2** | Store + âncoras + Lugares + layout determinístico + Farol lexical + troca de tema | mover → recarregar → idêntico; 2 abas convergem; busca por título/domínio |
| **F3** | Deck + tradutor unificado + context menu + popup launcher | legendas simultâneas no overlay e no tile; stop pelo shell; fechar shell não derruba captura |
| **F4** | Palco: pool 3, FLIP, fallback | Wikipedia embute; Google degrada com aviso; 4º iframe suspende LRU |
| **F5** | z0 constelação + histerese + mergulho polido | varrer 0.02→4 sem flicker nas bandas; nunca > 3 iframes |
| **F6** | Atlas heurístico: history opt-in, Radar completo, clusters por domínio | ativar histórico popula ranqueado; recusar permissão não quebra nada |
| **F7** | intel: embeddings NE, k-médias, rótulos, busca semântica | smoke cobre `intel.embed`; query semântica acha sem match literal; funciona offline |
| **v2** | DNR opt-in, importador de temas VSCode, Trilho, miniaturas, `chrome_url_overrides` opt-in | — |
| **v3** | Nuvem: conta, sync (schema já pronto), dispositivos no Farol/Deck | visao.md fases 3–4 |

**Meta imediata: v1 = F0–F4 funcionais no macOS** (F5/F6 se o tempo permitir). Cada fase
commitada separadamente.

## Riscos (top 5)

1. **Sites que não embutem / login em iframe** → fallback tab-only persistido + badges; não bloqueia o valor.
2. **`tabCapture` exige gesto** → start via popup/context menu; shell controla e exibe.
3. **Memória de iframes vivos** → pool 3, suspensão real (remoção do DOM).
4. **Vida do SW MV3** → estado ressuscitável + reconexão idempotente da porta.
5. **Migração de protocolo** → dual-mode + smoke nos dois modos antes de mexer na extensão.
