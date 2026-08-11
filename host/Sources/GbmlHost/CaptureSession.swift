import Foundation
import Translation

/// Estado de uma sessão de legendas: recebe PCM da extensão, alimenta o
/// SpeechAnalyzer e traduz os segmentos finais. Chunks que chegam enquanto o
/// modelo ainda está carregando ficam em buffer e são despejados quando o
/// transcriber fica pronto.
///
/// Thread-safety: o loop de leitura (thread do stdin) e as tasks de
/// inicialização/parada tocam o mesmo estado; tudo passa pelo `lock`.
final class CaptureSession: @unchecked Sendable {
    static let sampleRate = 16000
    static let bytesPerSample = 2 // Int16 mono

    // ~5 min de áudio; acima disso o buffer descarta os chunks mais antigos.
    private static let maxPendingChunks = 1500

    let sourceLanguage: String?
    let targetLanguage: String

    private let lock = NSLock()
    private var transcriber: Transcriber?
    private var pendingChunks: [Data] = []
    private var failed = false
    private var stopped = false
    private var totalBytesReceived = 0

    private var translator: Translator?
    private let finalsBuilder: AsyncStream<String>.Continuation
    private let finals: AsyncStream<String>
    private var translationTask: Task<Void, Never>?

    init(sourceLanguage: String?, targetLanguage: String) {
        self.sourceLanguage = sourceLanguage
        self.targetLanguage = targetLanguage
        (self.finals, self.finalsBuilder) = AsyncStream.makeStream(of: String.self)
    }

    var bytesReceived: Int {
        lock.lock()
        defer { lock.unlock() }
        return totalBytesReceived
    }

    var secondsReceived: Double {
        Double(bytesReceived) / Double(Self.bytesPerSample) / Double(Self.sampleRate)
    }

    /// Inicializa transcriber e tradutor em background. `onReady`/`onFailure`
    /// avisam o runtime para responder ao Chrome.
    func begin(
        onReady: @escaping @Sendable () -> Void,
        onFailure: @escaping @Sendable (String) -> Void
    ) {
        let effectiveSource = sourceLanguage ?? "en-US"
        Task {
            do {
                let transcriber = try await Transcriber.make(
                    locale: Locale(identifier: effectiveSource),
                    onStatus: { message in
                        NativeMessaging.send(["type": "status", "message": message])
                    },
                    onResult: { [weak self] result in
                        self?.handleTranscription(result)
                    }
                )
                let attached = self.attach(transcriber)
                guard attached else {
                    onFailure("sessão encerrada antes do modelo ficar pronto")
                    return
                }
                await self.setUpTranslator(source: effectiveSource)
                self.startTranslationPipeline()
                onReady()
            } catch {
                self.markFailed()
                onFailure("transcrição indisponível: \(error)")
            }
        }
    }

    func append(pcm: Data) {
        lock.lock()
        defer { lock.unlock() }

        totalBytesReceived += pcm.count
        if failed {
            return
        }

        guard let transcriber else {
            pendingChunks.append(pcm)
            if pendingChunks.count > Self.maxPendingChunks {
                pendingChunks.removeFirst()
                NativeMessaging.log("buffer de espera cheio, descartando o chunk mais antigo")
            }
            return
        }

        appendToTranscriber(pcm, transcriber)
    }

    /// Fecha a entrada, espera os resultados finais do analyzer e as traduções
    /// pendentes.
    func stop() async {
        let activeTranscriber = lock.withLock { () -> Transcriber? in
            stopped = true
            let active = transcriber
            transcriber = nil
            return active
        }
        await activeTranscriber?.finish()

        finalsBuilder.finish()
        await translationTask?.value
        translator?.shutdown()
    }

    private func handleTranscription(_ result: TranscriptionResult) {
        if result.isFinal {
            finalsBuilder.yield(result.text)
        } else {
            NativeMessaging.send(["type": "partial", "text": result.text])
        }
    }

    /// Traduções saem em FIFO: um único consumidor garante que as legendas
    /// finais cheguem à extensão na ordem em que foram faladas.
    private func startTranslationPipeline() {
        translationTask = Task { [finals, translator] in
            for await text in finals {
                var payload: [String: Any] = ["type": "final", "text": text]
                if let translator {
                    do {
                        payload["translated"] = try await translator.translate(text)
                    } catch {
                        NativeMessaging.log("tradução falhou: \(error)")
                    }
                }
                NativeMessaging.send(payload)
            }
        }
    }

    private func setUpTranslator(source: String) async {
        let sourceLanguage = Locale.Language(identifier: source)
        let target = Locale.Language(identifier: targetLanguage)

        if sourceLanguage.isEquivalent(to: target) {
            NativeMessaging.log("origem e destino iguais; sessão sem tradução")
            return
        }

        let availability = LanguageAvailability()
        let status = await availability.status(from: sourceLanguage, to: target)
        switch status {
        case .installed:
            translator = Translator(
                sourceLanguage: source,
                targetLanguage: targetLanguage,
                needsDownload: false
            )
        case .supported:
            NativeMessaging.send([
                "type": "status",
                "message": "Baixando o par de tradução \(source) → \(targetLanguage)…",
            ])
            translator = Translator(
                sourceLanguage: source,
                targetLanguage: targetLanguage,
                needsDownload: true
            )
        case .unsupported:
            NativeMessaging.send([
                "type": "status",
                "message": "Tradução \(source) → \(targetLanguage) não suportada; legendas sem tradução.",
            ])
        @unknown default:
            NativeMessaging.log("status de tradução desconhecido: \(status)")
        }
    }

    /// Retorna false se a sessão foi parada antes de o transcriber ficar
    /// pronto; nesse caso o transcriber é finalizado em vez de anexado.
    private func attach(_ transcriber: Transcriber) -> Bool {
        let discarded = lock.withLock { () -> Bool in
            if stopped {
                return true
            }
            self.transcriber = transcriber
            for chunk in pendingChunks {
                appendToTranscriber(chunk, transcriber)
            }
            pendingChunks.removeAll()
            return false
        }
        if discarded {
            Task {
                await transcriber.finish()
            }
            return false
        }
        return true
    }

    private func markFailed() {
        lock.lock()
        defer { lock.unlock() }
        failed = true
        pendingChunks.removeAll()
    }

    private func appendToTranscriber(_ pcm: Data, _ transcriber: Transcriber) {
        do {
            try transcriber.append(pcm: pcm)
        } catch {
            NativeMessaging.log("falha ao alimentar o transcriber: \(error)")
        }
    }
}
