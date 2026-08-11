// AudioWorklet que acumula o áudio mono do contexto (já a 16 kHz) e emite
// chunks Int16 de ~200 ms para a thread principal do offscreen document.
const SAMPLES_PER_CHUNK = 3200; // 200 ms a 16 kHz

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(SAMPLES_PER_CHUNK);
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs[0][0];
    if (!channel) {
      return true;
    }

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.offset] = channel[i];
      this.offset++;
      if (this.offset === SAMPLES_PER_CHUNK) {
        this.flush();
      }
    }
    return true;
  }

  flush() {
    const pcm = new Int16Array(SAMPLES_PER_CHUNK);
    for (let i = 0; i < SAMPLES_PER_CHUNK; i++) {
      const clamped = Math.max(-1, Math.min(1, this.buffer[i]));
      pcm[i] = Math.round(clamped * 32767);
    }
    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    this.offset = 0;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
