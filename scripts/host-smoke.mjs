// Smoke test do gbml-host: fala o protocolo Native Messaging (4 bytes LE + JSON)
// pelo stdin/stdout do binário, sem precisar do Chrome.
//
// Sem argumentos: ping/pong + start → 1s de seno 440 Hz → stop (valida o contrato).
// Com --wav <arquivo>: envia um WAV (PCM s16le mono 16 kHz) e exige pelo menos
// uma transcrição final não vazia — valida o SpeechAnalyzer de ponta a ponta.
//
// Uso: node scripts/host-smoke.mjs [--wav caminho.wav] [caminho-do-binario]
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const DEFAULT_BIN = path.join(ROOT, 'host', '.build', 'debug', 'gbml-host')

const SAMPLE_RATE = 16000
const CHUNK_SAMPLES = 3200 // 200 ms
const CHUNK_BYTES = CHUNK_SAMPLES * 2

const args = process.argv.slice(2)
let wavPath = null
let targetLanguage = 'pt-BR'
let binary = DEFAULT_BIN
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--wav') {
    wavPath = args[i + 1]
    i++
  } else if (args[i] === '--target') {
    targetLanguage = args[i + 1]
    i++
  } else {
    binary = args[i]
  }
}

function frame(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8')
  const header = Buffer.alloc(4)
  header.writeUInt32LE(payload.length)
  return Buffer.concat([header, payload])
}

function collectFrames(buffer, onMessage) {
  let rest = buffer
  while (rest.length >= 4) {
    const length = rest.readUInt32LE(0)
    if (rest.length < 4 + length) {
      break
    }
    onMessage(JSON.parse(rest.subarray(4, 4 + length).toString('utf8')))
    rest = rest.subarray(4 + length)
  }
  return rest
}

function sinePcm(seconds) {
  const total = SAMPLE_RATE * seconds
  const pcm = new Int16Array(total)
  for (let i = 0; i < total; i++) {
    pcm[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE) * 16000)
  }
  return Buffer.from(pcm.buffer)
}

// Extrai o chunk "data" de um WAV PCM s16le mono 16 kHz (formato do
// `say --data-format=LEI16@16000`).
function wavPcm(file) {
  const wav = readFileSync(file)
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${file} não é um WAV`)
  }
  let offset = 12
  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString('ascii', offset, offset + 4)
    const chunkSize = wav.readUInt32LE(offset + 4)
    if (chunkId === 'fmt ') {
      const sampleRate = wav.readUInt32LE(offset + 12)
      const channels = wav.readUInt16LE(offset + 10)
      if (sampleRate !== SAMPLE_RATE || channels !== 1) {
        throw new Error(`WAV precisa ser mono ${SAMPLE_RATE} Hz (veio ${channels}ch ${sampleRate} Hz)`)
      }
    }
    if (chunkId === 'data') {
      return wav.subarray(offset + 8, offset + 8 + chunkSize)
    }
    offset += 8 + chunkSize + (chunkSize % 2)
  }
  throw new Error(`chunk "data" não encontrado em ${file}`)
}

let pcm = null
if (wavPath) {
  pcm = wavPcm(wavPath)
} else {
  pcm = sinePcm(1)
}

const host = spawn(binary, { stdio: ['pipe', 'pipe', 'inherit'] })
let pending = Buffer.alloc(0)
const received = []
let chunkCount = 0

// O áudio só é enviado depois do "started" — antes disso o modelo de fala
// ainda está carregando e um "stop" precoce encerraria a sessão sem transcrever.
function streamAudioAndStop() {
  for (let offset = 0; offset < pcm.length; offset += CHUNK_BYTES) {
    const chunk = pcm.subarray(offset, offset + CHUNK_BYTES)
    host.stdin.write(frame({ type: 'audio', pcm: chunk.toString('base64') }))
    chunkCount++
  }
  host.stdin.write(frame({ type: 'stop' }))
  host.stdin.end()
}

host.stdout.on('data', (chunk) => {
  pending = collectFrames(Buffer.concat([pending, chunk]), (message) => {
    received.push(message)
    console.log('host →', JSON.stringify(message))
    if (message.type === 'started') {
      streamAudioAndStop()
    }
  })
})

host.stdin.write(frame({ type: 'ping' }))
host.stdin.write(frame({ type: 'start', sourceLanguage: 'en-US', targetLanguage }))

host.on('close', (code) => {
  const failures = []

  if (!received.some((message) => message.type === 'pong')) {
    failures.push('nenhum pong recebido')
  }
  if (!received.some((message) => message.type === 'started')) {
    failures.push('start não confirmado')
  }

  const stopped = received.find((message) => message.type === 'stopped')
  if (!stopped) {
    failures.push('stop não confirmado')
  } else if (stopped.bytesReceived !== pcm.length) {
    failures.push(`bytesReceived=${stopped.bytesReceived}, esperado ${pcm.length}`)
  }

  const finals = received.filter((message) => message.type === 'final' && message.text.trim() !== '')
  if (wavPath && finals.length === 0) {
    failures.push('nenhuma transcrição final para o WAV de fala')
  }

  for (const error of received.filter((message) => message.type === 'error')) {
    failures.push(`host reportou erro: ${error.message}`)
  }

  if (failures.length > 0) {
    console.error(`FALHOU (exit ${code}):\n- ` + failures.join('\n- '))
    process.exit(1)
  }

  if (finals.length > 0) {
    console.log('transcrição:', finals.map((message) => message.text).join(' '))
  }
  console.log(`OK: ping + start + ${chunkCount} chunks (${stopped.secondsReceived.toFixed(1)}s) + stop`)
})
