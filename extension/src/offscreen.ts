import { AUDIO_SAMPLE_RATE } from "./protocol";
import type { AudioChunkCommand, InternalCommand } from "./protocol";

// Captura o áudio da aba (streamId vindo do background), mantém a aba audível
// e envia PCM 16 kHz mono Int16 em chunks de ~200 ms para o background.

interface CaptureResources {
  stream: MediaStream;
  playbackContext: AudioContext;
  captureContext: AudioContext;
}

let resources: CaptureResources | null = null;

async function startCapture(streamId: string): Promise<void> {
  if (resources) {
    await stopCapture();
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      // @ts-expect-error propriedades específicas do Chrome para captura de aba
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  // tabCapture silencia a aba; re-rotear o stream mantém o áudio audível.
  const playbackContext = new AudioContext();
  const playbackSource = playbackContext.createMediaStreamSource(stream);
  playbackSource.connect(playbackContext.destination);

  // Contexto dedicado a 16 kHz: o próprio Chrome re-amostra o stream.
  const captureContext = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
  await captureContext.audioWorklet.addModule("pcm-capture.js");
  const captureSource = captureContext.createMediaStreamSource(stream);
  const worklet = new AudioWorkletNode(captureContext, "pcm-capture", {
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
  });
  worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    sendChunk(event.data);
  };
  captureSource.connect(worklet);
  // O worklet precisa de um destino para o grafo processar; o gain 0 evita eco.
  const silence = new GainNode(captureContext, { gain: 0 });
  worklet.connect(silence);
  silence.connect(captureContext.destination);

  resources = { stream, playbackContext, captureContext };
}

function sendChunk(buffer: ArrayBuffer): void {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const command: AudioChunkCommand = { cmd: "audio-chunk", pcm: btoa(binary) };
  chrome.runtime.sendMessage(command);
}

async function stopCapture(): Promise<void> {
  if (!resources) {
    return;
  }
  const { stream, playbackContext, captureContext } = resources;
  resources = null;
  stream.getTracks().forEach((track) => track.stop());
  await captureContext.close();
  await playbackContext.close();
}

chrome.runtime.onMessage.addListener(
  (message: InternalCommand, _sender, sendResponse) => {
    if (message.cmd === "offscreen-start") {
      startCapture(message.streamId)
        .then(() => sendResponse({ ok: true }))
        .catch((error: Error) =>
          sendResponse({ ok: false, error: error.message }),
        );
      return true;
    }
    if (message.cmd === "offscreen-stop") {
      stopCapture()
        .then(() => sendResponse({ ok: true }))
        .catch((error: Error) =>
          sendResponse({ ok: false, error: error.message }),
        );
      return true;
    }
    return false;
  },
);
