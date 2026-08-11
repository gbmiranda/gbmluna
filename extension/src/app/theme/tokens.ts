// Tokens de cor do tema (--t-*) — nomes canônicos do Luna DS
// (docs/design-system.md §2.1). Todo componente consome cor SOMENTE por estes
// tokens; hex literal só existe em themes.ts.

export type TokenMatiz =
  | "--t-hue-1"
  | "--t-hue-2"
  | "--t-hue-3"
  | "--t-hue-4"
  | "--t-hue-5"
  | "--t-hue-6"
  | "--t-hue-7";

export type TokenTema =
  | "--t-bg-canvas"
  | "--t-bg-surface"
  | "--t-bg-raised"
  | "--t-fg"
  | "--t-fg-muted"
  | "--t-accent"
  | "--t-accent-fg"
  | "--t-moon"
  | "--t-border"
  | "--t-shadow"
  | "--t-sel-bg"
  | "--t-ok"
  | "--t-warn"
  | "--t-err"
  | TokenMatiz;

export interface TemaDef {
  id: string;
  nome: string;
  tipo: "dark" | "light";
  builtIn: boolean;
  tokens: Record<TokenTema, string>;
}

// Lista completa na ordem da tabela do DS — útil para aplicar/limpar em lote e
// para o importador de temas (v2) validar cobertura.
export const TOKENS_TEMA: readonly TokenTema[] = [
  "--t-bg-canvas",
  "--t-bg-surface",
  "--t-bg-raised",
  "--t-fg",
  "--t-fg-muted",
  "--t-accent",
  "--t-accent-fg",
  "--t-moon",
  "--t-border",
  "--t-shadow",
  "--t-sel-bg",
  "--t-ok",
  "--t-warn",
  "--t-err",
  "--t-hue-1",
  "--t-hue-2",
  "--t-hue-3",
  "--t-hue-4",
  "--t-hue-5",
  "--t-hue-6",
  "--t-hue-7",
];
