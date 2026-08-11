# Luna DS — design system e identidade visual

> Fonte única do design do shell Luna (twoDDD). Direção definida pelo dono do projeto:
> **8-bit minimalista, na linha do Claude Code** — familiar, de adaptação fácil — com a
> exigência de ser robusto, intuitivo e acessível. Consome os mesmos tokens de tema
> estilo VSCode do [twoddd.md](twoddd.md): a identidade é estrutural (pixel, borda,
> sombra dura), a cor é temática (troca com o tema).

## 1. Identidade: "fliperama lunar"

Luna é um céu noturno navegável. A estética é a de um terminal/fliperama espacial dos
anos 80 lida com olhos de hoje: **pixel como material, não como nostalgia**. Tudo é
nítido, de canto vivo, com sombra sólida deslocada (nunca blur), sobre um céu profundo
onde os sites do usuário são estrelas.

Por que 8-bit ganha do neumorfismo aqui (decisão registrada):

1. **Acessibilidade** — neumorfismo vive de contraste baixo (superfície quase da cor do
   fundo); 8-bit vive de contraste alto e contorno explícito. Com a exigência de
   interface acessível, não há disputa.
2. **Performance** — sombra sólida (`box-shadow` sem blur) e borda 1px custam quase nada
   no compositor; sombras suaves em centenas de tiles custam raster. O Plano precisa de
   60 fps.
3. **Temas VSCode** — cores chapadas mapeiam 1:1 dos tokens de tema; relevo suave não.
4. **Familiaridade** — a gramática de jogo (seleção com anel, avatar, mapa, HUD) é a
   mais universalmente aprendida que existe; "fácil das pessoas irem se adaptando".

### Assinatura (o elemento memorável)

**O Firmamento.** O fundo do Plano é um painel OLED gigante: milhares de pixels RGB
individuais que acendem e apagam em ondas sincronizadas — uma cena 8-bit viva, orgânica
e natural (pense no céu noturno de um jogo minimalista estilo Stardew Valley). Não é
papel de parede: os pixels **são** informação — constelações são os clusters do usuário,
o calor do Radar aquece regiões relevantes, filtros escurecem o que não casa, o pan/zoom
ondula a cena. Spec técnica no [twoddd.md](twoddd.md) (seção zoom semântico).

Apoio discreto: **a Lua de zoom** no HUD — pixel art 16×16 cuja fase indica a
profundidade (nova no z0, crescente no z1, cheia no Palco). Sempre informação, nunca
decoração. Todo o resto da interface fica quieto e disciplinado para o Firmamento ser
o único protagonista.

### Voz

Terminal calmo: frases curtas, verbos no imperativo, sentence case, zero enfeite.
"Legendar esta aba", não "Ative já suas legendas!". Erros dizem o que houve e o que
fazer: "Este site não permite embutir. Abrir na aba?". Tela vazia é convite: "Aperte
Cmd+K e busque qualquer coisa".

## 2. Tokens

### 2.1 Cor — tema (`--t-*`, troca com o tema; mapeamento VSCode no twoddd.md)

Tema padrão **Meia-noite** (dark, embutido); **Papel** (light, embutido).

| Token | Meia-noite | Papel | Uso |
|---|---|---|---|
| `--t-bg-canvas` | `#0b0e14` | `#f4f4f2` | céu / fundo do Plano |
| `--t-bg-surface` | `#131722` | `#ffffff` | cartões, painéis |
| `--t-bg-raised` | `#1a2030` | `#eceae6` | Farol, Palco header, HUD |
| `--t-fg` | `#e2e8f0` | `#1a1d23` | texto primário (AA sobre surface) |
| `--t-fg-muted` | `#8b93a7` | `#6b7280` | texto secundário (AA large) |
| `--t-accent` | `#d97757` | `#c15f3c` | ação primária, seleção — "brasa" |
| `--t-accent-fg` | `#0b0e14` | `#ffffff` | texto sobre accent |
| `--t-moon` | `#aeb9d6` | `#7c8db0` | luar: bordas de destaque, a Lua, estrelas |
| `--t-border` | `#2a3040` | `#d6d3cd` | contorno padrão 1px |
| `--t-shadow` | `#000000` | `#c9c5bd` | sombra sólida (sem alpha, sem blur) |
| `--t-sel-bg` | `#d9775740` | `#c15f3c26` | fundo de seleção |
| `--t-ok` / `--t-warn` / `--t-err` | `#7dc87d` / `#e5c07b` / `#e06c75` | análogos | estados (sempre com ícone/texto junto) |
| `--t-hue-1..7` | 7 matizes OKLCH equidistantes a partir de `--t-accent` | idem | cores de cluster |

Dupla temperatura deliberada: estrutura fria (céu, luar) + ação quente (brasa) — o olho
acha o interativo sem esforço. Temas VSCode importados (v2) passam por validação de
contraste (AA mínimo fg/surface; se falhar, o importador corrige o fg e avisa).

### 2.2 Estrutura (`--ds-*`, fixos — a identidade que sobrevive a qualquer tema)

| Token | Valor | Nota |
|---|---|---|
| `--ds-unit` | `8px` | grid base; sub-passo 4px |
| `--ds-radius` | `2px` | canto quase vivo; `0` em pixel art |
| `--ds-border` | `1px solid var(--t-border)` | contorno universal |
| `--ds-e1` | `box-shadow: 2px 2px 0 var(--t-shadow)` | elevação de cartão |
| `--ds-e2` | `box-shadow: 4px 4px 0 var(--t-shadow)` + borda `--t-moon` | overlays (Farol, Palco) |
| `--ds-e-1` | `box-shadow: inset 1px 1px 0 var(--t-shadow)` | poços (inputs, wells) |
| `--ds-focus` | `outline: 2px solid var(--t-accent); outline-offset: 2px` | anel pixel — sempre visível, nunca suprimido |
| `--ds-snap` | `120ms steps(3)` | micro-interações (hover, toggle) |
| `--ds-glide` | `260ms cubic-bezier(0.2, 0, 0, 1)` | Mergulho, enquadramentos |

`prefers-reduced-motion`: `--ds-glide` vira `0ms` (corte seco + crossfade de 80 ms);
nada essencial é comunicado só por movimento.

### 2.3 Tipografia

| Papel | Fonte | Uso |
|---|---|---|
| Interface | `-apple-system, system-ui` | corpo, controles — legibilidade nativa |
| Dados/terminal | `ui-monospace, "SF Mono", monospace` | URLs, domínios, atalhos, transcript, HUD |
| Marca | **wordmark "LUNA" em SVG pixel art inline** | só no HUD e na tela vazia |

Escala (px): 11 (HUD/atalhos) · 12 (rótulos, domínio) · 13 (corpo, controles) ·
15 (título de cartão) · 20 (título de Palco). Pesos 400/600 apenas. Sem fonte externa na
v1 (zero deps, build simples); uma pixel font OFL vendorizada é opção de v2 para a marca.

### 2.4 Pixel art

Ícones 16×16 desenhados como SVG inline (`shape-rendering: crispEdges`): lua (5 fases),
estrela (2 tamanhos), âncora, casa (Deck), engrenagem, play/stop, olho (overlay),
aba-externa, cadeado. `image-rendering: pixelated` **só** em assets pixel art — nunca em
texto ou UI. Estrelas do z0 desenhadas no canvas como quadrados 2×2/3×3 (não círculos):
constelação genuinamente 8-bit, e `fillRect` é mais barato que `arc`.

## 3. Componentes (inventário e receitas)

Regra de componentização: cada componente é uma função `render*()` em
`app/ui/components.ts` que consome **somente tokens** (`--t-*`, `--ds-*`); nenhum hex
fora de `theme/themes.ts`; nenhum estilo inline de cor. Estados sempre nomeados por
classe (`is-ativo`, `is-erro`), nunca só por cor.

| Componente | Receita | A11y |
|---|---|---|
| **Botão primário** | fundo `--t-accent`, texto `--t-accent-fg`, `--ds-e1`; `:active` desloca 2px anulando a sombra ("afunda" físico) | `<button>`, foco `--ds-focus` |
| **Botão fantasma** | transparente + `--ds-border`; hover: borda `--t-moon` | idem |
| **Botão perigo** | como primário com `--t-err` | confirmação para destrutivo |
| **Select / Campo** | fundo `--t-bg-canvas`, `--ds-e-1`, texto mono quando dado | `<select>`/`<input>` nativos estilizados; label sempre |
| **Switch** | trilho 32×16 pixel, polegar quadrado 12×12; ligado = `--t-accent` | `role="switch"`, `aria-checked` |
| **Cartão de site (z1)** | surface + `--ds-border` + `--ds-e1`; favicon 24, título 15/600 (2 linhas), domínio mono 12 muted; brilho por Radar via `opacity` | tile focável (`tabindex`), nome acessível = título |
| **Tile de módulo** | como cartão, 320×400, cabeçalho com ícone pixel + estado; corpo livre do módulo | `role="region"` + `aria-label` |
| **Badge de estado** | quadrado 8×8 + rótulo curto ("ativo", "bloqueado") | nunca só cor |
| **Palco** | overlay `--t-bg-raised`, header 40px (título 20, URL mono, ações), iframe abaixo; borda `--ds-e2` | foco preso no overlay; Esc fecha; título anunciado |
| **Farol** | caixa central 560px, `--ds-e2`; input mono; resultados com match destacado em `--t-accent`; atalhos à direita em 11 mono | `role="combobox"` + `aria-activedescendant`; navegação por setas |
| **HUD** | canto inferior: wordmark, Lua de zoom, zoom %, tema | `aria-live="polite"` para mudança de nível |
| **Toast** | canto superior, surface + `--ds-e1`, some em 4s | `role="status"` |
| **Transcript (tradutor)** | 6 linhas mono 13; parcial itálico muted; final com tradução em `--t-fg` | `aria-live="polite"` |
| **Blob de cluster (z0)** | hull preenchido `--t-hue-n` a 12%, contorno 1px pontilhado, rótulo 12 mono | rótulos legíveis em qualquer tema |
| **Borda de Lugar** | retângulo tracejado 1px `--t-moon` a 40%, nome no canto em 12 mono | — |

## 4. Regras de acessibilidade (inegociáveis)

1. Contraste AA em todo par texto/fundo dos temas embutidos; importador valida e corrige.
2. Foco visível sempre (`--ds-focus`); navegação completa por teclado (tabela no twoddd.md).
3. Alvos de toque/click ≥ 44×44 px (o cartão inteiro é o alvo, não o favicon).
4. `prefers-reduced-motion` respeitado; zoom/mergulho têm equivalente sem animação.
5. Significado nunca só por cor (badge = forma + texto; Radar = brilho **e** ordenação).
6. `prefers-color-scheme` escolhe o tema inicial (Meia-noite/Papel); escolha manual persiste.

## 5. Anti-padrões (o que este DS proíbe)

- Blur, glassmorphism, gradientes decorativos, neumorfismo — a profundidade aqui é
  sombra sólida + escala do zoom, nada mais.
- Hex fora de `themes.ts`; estilo de cor inline; `!important`.
- Animação sem função (parallax ok no mergulho; partículas de fundo, não).
- Ícone sem rótulo em controle primário; tooltip como única explicação.
- Fonte externa por CDN (CSP da extensão nem permite — assets sempre locais).
