# gbml — regras do projeto

## Atributos inegociáveis

Cada linha, classe, função, funcionalidade, planejamento, análise e desenvolvimento
neste projeto deve considerar explicitamente estes atributos (definidos pelo dono do
projeto; não são opcionais):

1. **Modularização** — cada capacidade é um módulo com contrato próprio (envelope
   `{module, type}` no protocolo); módulos não se acoplam entre si.
2. **Reutilização** — antes de criar, procurar o que já existe no repo; o contrato
   ext↔host tem fonte única (`extension/src/protocol.ts`).
3. **Idempotência** — toda operação é repetível sem efeito duplicado: upsert por id
   estável, guards de re-injeção/re-registro, start/stop tolerantes a chamadas
   repetidas, migrações de schema versionadas.
4. **Robustez** — falha isolada não derruba o todo: erro de um tile/módulo é contido,
   porta nativa tem timeout e reconexão, estado sobrevive à morte do service worker
   (MV3) e é recuperável de storage.
5. **Segurança** — permissão mínima necessária por fase; regras declarativeNetRequest
   restritas a sub_frames iniciados pela própria extensão; iframes isolados; dado do
   usuário nunca sai da máquina (local-first) até a fase de nuvem, e lá só cifrado.
6. **Performance** — canvas a 60 fps; virtualização (só o visível existe no DOM);
   transform composto em GPU; orçamento explícito de iframes vivos.
7. **Eficiência** — zero dependência de runtime sem justificativa escrita; trabalho
   pesado fora da main thread; Neural Engine (via host Swift) para ASR, tradução e
   embeddings.
8. **Inteligência / sagacidade** — organizar, buscar e filtrar pelo contexto do usuário
   (frequência, recência, hora do dia, semântica local); heurística simples e boa antes
   de complexidade; capacidade de processamento local usada ao máximo.

## Fatos do projeto

- Extensão Chrome MV3 em TypeScript puro (esbuild, tsconfig strict, prettier default,
  zero deps de runtime) + host nativo Swift (macOS 26, Apple Silicon) via Native
  Messaging.
- Mensagens ext↔host usam a chave `type`; mensagens internas da extensão usam `cmd` —
  distinção deliberada.
- Comentários e strings de UI em português; comentário explica o porquê, nunca o quê.
- Visão de produto: `docs/visao.md` (hub multi-tools + sync na nuvem).
  Shell espacial twoDDD: `docs/twoddd.md`.
- Formatação: `cd extension && npm run format` antes de finalizar mudanças no front.
