# gbmulti language (gbml)

Legendas traduzidas em tempo real para qualquer vídeo tocando numa aba do Chrome —
**100% local**, sem nuvem, sem heurísticas: modelos neurais end-to-end rodando no
**Apple Neural Engine**.

- **Transcrição**: SpeechAnalyzer / SpeechTranscriber (macOS 26), o mesmo motor do
  Live Captions do sistema.
- **Tradução**: Translation framework da Apple, on-device.
- **Arquitetura**: extensão Chrome (MV3) + host nativo Swift conectados por
  Native Messaging.

```
┌─ Chrome ──────────────────────────────┐
│ popup (idiomas, start/stop)           │
│ background SW ── porta nativa ─────┐  │
│ offscreen: tabCapture → 16kHz PCM  │  │
│ content script: overlay legendas ◄─┼──┼─┐
└────────────────────────────────────┼──┘ │
                     Native Messaging▼    │
┌─ gbml-host (Swift) ───────────────────┐ │
│ SpeechAnalyzer ──► Neural Engine      │ │
│ TranslationSession (on-device)        │─┘
└───────────────────────────────────────┘
```

## Requisitos

- macOS 26 (Tahoe) ou superior, Apple Silicon
- Google Chrome 120+
- Xcode Command Line Tools (para compilar o host)
- Node.js 20+ (para compilar a extensão)

## Instalação (desenvolvimento)

1. **Host nativo** — compila e registra o manifest de Native Messaging no Chrome:

   ```bash
   ./scripts/install-host.sh
   ```

2. **Extensão**:

   ```bash
   cd extension && npm install && npm run build
   ```

   Depois, em `chrome://extensions` → ative o "Modo do desenvolvedor" →
   "Carregar sem compactação" → aponte para `extension/dist/`.

3. Reinicie o Chrome (necessário para ele reconhecer o host nativo).

## Uso

1. Abra um vídeo (YouTube, por exemplo), clique no ícone da extensão.
2. Escolha o idioma do vídeo e o idioma das legendas e clique em
   **Iniciar legendas**.
3. No primeiro uso, o host baixa o modelo de fala e o sistema pede confirmação
   para baixar o par de idiomas de tradução — só acontece uma vez por idioma.

As legendas parciais aparecem no idioma original enquanto a frase está sendo
falada; ao fechar a frase, entram traduzidas.

## Desenvolvimento

| Comando | O que faz |
| --- | --- |
| `node scripts/host-smoke.mjs` | Testa o contrato do protocolo (ping + áudio sintético) |
| `node scripts/host-smoke.mjs --wav fala.wav` | Testa transcrição real (WAV mono 16 kHz s16le) |
| `node scripts/host-smoke.mjs --wav fala.wav --target en-US` | Idem, sem tradução |
| `cd extension && npm run build` | Gera `extension/dist/` |
| `cd extension && npm run typecheck` | Checagem de tipos |
| `swift build --package-path host` | Compila o host (debug) |

Para gerar um WAV de teste com fala sintetizada:

```bash
say -o fala.wav --data-format=LEI16@16000 "Hello, welcome back to the channel."
```

### Protocolo extensão ↔ host

Frames de Native Messaging (4 bytes de tamanho LE + JSON). Tipos definidos em
`extension/src/protocol.ts` (fonte única) e implementados em
`host/Sources/GbmlHost/HostRuntime.swift`:

- extensão → host: `ping`, `start {sourceLanguage, targetLanguage}`,
  `audio {pcm: base64 Int16 16kHz mono}`, `stop`, `translation-status`
- host → extensão: `pong`, `started`, `status`, `partial {text}`,
  `final {text, translated?}`, `stopped {bytesReceived, secondsReceived}`,
  `translation-status {status}`, `error`

## Limitações conhecidas (v1)

- O binário do host não é assinado/notarizado — distribuição fora da máquina de
  desenvolvimento exige Developer ID.
- Idioma de origem é escolhido manualmente (sem detecção automática ainda).
- Uma captura por vez, sempre da aba ativa.
