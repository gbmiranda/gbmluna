# Visão: gbml como hub multi-tools

> Documento de visão. Descreve para onde o projeto vai, não o que existe hoje.
> O estado atual está no [README](../README.md).

## Resumo

O gbml nasceu como tradutor de legendas ao vivo, mas o tradutor é só o primeiro módulo.
A visão é um **hub de ferramentas pessoais multiplataforma** (macOS, Windows, Linux):

- Cada ferramenta é um **módulo** independente (tradutor, amphetamine, dados da máquina,
  rede, wi-fi, monitor…).
- Uma **conta única na nuvem** conecta todos os dispositivos do usuário.
- Um dispositivo pode **enviar comandos a outro** — por exemplo, do Mac mandar o Windows
  trocar a saída de vídeo para HDMI, ou ativar o modo amphetamine no Linux.

## Princípios

1. **Local-first.** O que puder rodar na máquina, roda na máquina — como o tradutor hoje,
   que não manda áudio para lugar nenhum. A nuvem existe para sincronizar e rotear
   comandos, não para processar dados.
2. **Módulo é opcional e independente.** Instalar/ativar um módulo não pode exigir os
   outros. Cada módulo declara em quais plataformas funciona.
3. **Uma conta, N dispositivos.** A mesma conta no Windows, no Mac e no Linux; cada
   dispositivo registrado enxerga os outros e os comandos que eles aceitam.
4. **Comando remoto é explícito e auditável.** Todo comando remoto identifica quem pediu,
   de qual dispositivo, e o dispositivo alvo responde com o resultado da execução.

## Módulos planejados

| Módulo | O que faz | macOS | Windows | Linux |
|---|---|:-:|:-:|:-:|
| **Tradutor** | Legendas traduzidas ao vivo do áudio da aba (existe hoje) | ✅ hoje | 🔎 avaliar | 🔎 avaliar |
| **Amphetamine** | Impede a máquina de dormir (tela e/ou sistema), com timer opcional | 🎯 | 🎯 | 🎯 |
| **Dados da máquina** | CPU, memória, disco, temperatura, bateria, uptime | 🎯 | 🎯 | 🎯 |
| **Rede** | Interfaces, IP local/público, latência, teste de velocidade | 🎯 | 🎯 | 🎯 |
| **Wi-Fi** | Rede atual, força do sinal, redes disponíveis, conectar/trocar | 🎯 | 🎯 | 🎯 |
| **Monitor / HDMI** | Alterna a saída de vídeo para HDMI (ex.: TV) e de volta | — | 🎯 | — |

🎯 = planejado · 🔎 = depende de haver ASR/tradução local equivalente na plataforma

### Notas por módulo

- **Tradutor** — hoje depende de SpeechAnalyzer + Translation framework (só macOS).
  Portar para Windows/Linux exige outro motor local (ex.: whisper.cpp + modelo de
  tradução local); fica para depois da base multiplataforma existir.
- **Amphetamine** — APIs nativas por plataforma: `IOPMAssertion`/`caffeinate` (macOS),
  `SetThreadExecutionState` (Windows), `systemd-inhibit` (Linux). É o módulo mais simples
  e o melhor candidato a primeiro módulo novo.
- **Dados da máquina / Rede / Wi-Fi** — majoritariamente leitura de APIs do sistema;
  úteis tanto localmente quanto consultados **de outro dispositivo** via nuvem
  ("quanto de RAM livre tem no desktop?").
- **Monitor / HDMI (Windows)** — caso de uso concreto: do Mac (ou do celular, no futuro),
  mandar o desktop Windows trocar para a saída HDMI antes de sentar no sofá.
  Implementação candidata: `DisplaySwitch.exe /external` ou `SetDisplayConfig`.

## Sincronização na nuvem

### O que sincroniza

1. **Identidade** — uma conta do usuário; cada instalação vira um **dispositivo
   registrado** (nome, plataforma, módulos ativos, última vez online).
2. **Comandos remotos** — dispositivo A publica um comando endereçado ao dispositivo B;
   B executa e responde com o resultado. É o coração da visão: "um reconhecer comandos
   dos outros".
3. **Preferências** — configurações de módulo (ex.: idioma alvo do tradutor, timer padrão
   do amphetamine) seguem a conta, não a máquina.

### Requisitos do transporte

- **Tempo real** quando os dois dispositivos estão online (WebSocket ou similar) — trocar
  o monitor precisa acontecer em segundos, não no próximo poll.
- **Fila com expiração** quando o alvo está offline: comando de ação (trocar monitor)
  expira rápido; preferência sincroniza quando o dispositivo voltar.
- **Confirmação de execução**: quem enviou vê se o comando chegou, executou ou falhou
  (e por quê).

### Segurança

- Autenticação da conta + **credencial por dispositivo** (revogável individualmente:
  perdeu o notebook → revoga só ele).
- Comandos remotos só entre dispositivos da **mesma conta**; nada de descoberta pública.
- Transporte cifrado (TLS no mínimo; cifra ponta-a-ponta do payload é decisão em aberto).
- Comandos que alteram o sistema (dormir, trocar monitor) podem exigir confirmação
  configurável no dispositivo alvo.

### Decisão em aberto: backend

| Opção | Prós | Contras |
|---|---|---|
| BaaS (Firebase/Supabase) | Auth, realtime e storage prontos; zero servidor para manter | Lock-in; realtime com semântica genérica |
| Backend próprio (API + WebSocket) | Controle total do protocolo de comandos | Custo de operar, manter e proteger |

Para um projeto pessoal, começar com BaaS e abstrair o transporte atrás de uma interface
própria (para poder trocar depois) parece o caminho de menor atrito — decisão a tomar na
fase 3 do roadmap.

## Evolução da arquitetura

### 1. Protocolo ganha namespace de módulo

Hoje o contrato ([`extension/src/protocol.ts`](../extension/src/protocol.ts)) é plano:
`ping` / `start` / `audio` / `stop`, tudo do tradutor. Com módulos, toda mensagem passa a
carregar um envelope:

```jsonc
// extensão/UI → host
{ "module": "translator", "type": "start", "targetLanguage": "pt-BR" }
{ "module": "amphetamine", "type": "enable", "minutes": 120 }
{ "module": "machine", "type": "get-stats" }

// host → extensão/UI
{ "module": "translator", "type": "caption", "text": "...", "isFinal": true }
```

O host vira um **roteador de módulos**: o `HostRuntime` deixa de conhecer o tradutor e
passa a despachar para módulos registrados; cada módulo declara seus tipos de mensagem.
Um comando remoto usa o mesmo envelope, acrescido de origem/destino — o formato local e o
remoto são o mesmo protocolo.

### 2. Um agente residente, não só um filho do Chrome

Hoje o `gbml-host` é um processo filho do Chrome: nasce quando a extensão conecta e morre
quando o Chrome fecha. Isso não serve para a visão:

- **Amphetamine** precisa continuar segurando a máquina acordada sem o Chrome aberto.
- **Comandos remotos** precisam de um processo sempre conectado à nuvem para *receber*
  ("trocar para HDMI" tem que chegar mesmo com o Chrome fechado).

A arquitetura alvo separa em dois:

```
┌─────────────────────────────┐        ┌──────────────────────────┐
│ UI (extensão Chrome, depois │◄──────►│ agente gbml (residente)  │◄────► nuvem
│ talvez menubar/tray app)    │  IPC   │ launchd / serviço Win /  │  WS
└─────────────────────────────┘        │ systemd user service     │
                                       │  ├─ módulo tradutor      │
                                       │  ├─ módulo amphetamine   │
                                       │  ├─ módulo machine/rede  │
                                       │  └─ módulo monitor (Win) │
                                       └──────────────────────────┘
```

A extensão Chrome vira **uma** das interfaces do agente, não a dona do processo.

### 3. Multiplataforma

O host atual é Swift e depende de frameworks Apple — certo para o tradutor, inviável como
base do agente em Windows/Linux. Decisão em aberto, com duas rotas:

- **Core compartilhado** (ex.: Rust ou Go): agente, protocolo, sync e módulos
  multiplataforma num binário só; módulos que dependem de API nativa (tradutor/macOS,
  monitor/Windows) entram como plugins por plataforma.
- **Agente por plataforma** falando o mesmo protocolo: mantém o Swift no macOS e replica
  o contrato em outra linguagem no Windows/Linux. Menos reescrita agora, três bases de
  código para sempre.

A escolha deve ser feita **antes** de escrever o segundo agente (fase 2), para não pagar
a migração duas vezes.

### 4. UI

O popup atual é do tradutor. Com módulos, ele evolui para um dashboard: lista de módulos
do dispositivo local + lista de dispositivos da conta com os comandos que cada um aceita.
Módulos que não dependem do Chrome (amphetamine, monitor) pedem, no futuro, uma UI fora
dele — menubar (macOS) / tray (Windows/Linux) no próprio agente.

## Roadmap

| Fase | Entrega | Depende de |
|---|---|---|
| **0 — hoje** | Tradutor funcional no macOS (extensão + host Swift) | — |
| **1 — modularizar** | Protocolo com envelope de módulo; `HostRuntime` vira roteador; primeiro módulo novo (amphetamine) no macOS | — |
| **2 — agente residente + multiplataforma** | Host vira agente residente (launchd); decisão da rota multiplataforma; agente Windows/Linux com módulos locais (machine, rede, wi-fi; monitor no Windows) | fase 1 |
| **3 — conta e nuvem** | Escolha do backend; login, registro de dispositivos, sync de preferências | fase 2 |
| **4 — comandos remotos** | Dispositivo A comanda dispositivo B em tempo real, com confirmação de execução | fase 3 |
| **5+ — expandir** | Tradutor em Windows/Linux (motor local alternativo), novos módulos, possível app/celular como controle remoto | fase 4 |

Regra de ouro do roadmap: **cada fase entrega algo usável sozinho.** A fase 1 já vale a
pena sem nuvem nenhuma (amphetamine local); a fase 3 já vale sem comando remoto
(preferências sincronizadas).

## Decisões em aberto (resumo)

1. **Nome** — "gbml" vem de *gbmulti language*; com o escopo multi-tools, avaliar renomear
   (ex.: *gbmulti*) antes de publicar qualquer coisa.
2. **Rota multiplataforma** — core compartilhado (Rust/Go) vs agente por plataforma
   (decidir na fase 2).
3. **Backend** — BaaS vs próprio (decidir na fase 3).
4. **Criptografia ponta-a-ponta** dos comandos — necessária ou TLS basta? (fase 3/4).
5. **Tradutor fora do macOS** — qual motor local usar, e se vale o custo (fase 5).
