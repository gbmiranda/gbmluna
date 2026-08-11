@preconcurrency import AVFoundation
import Foundation
import Speech

/// Resultado de transcrição repassado à extensão.
struct TranscriptionResult {
    let text: String
    let isFinal: Bool
}

/// Transcrição streaming com o SpeechAnalyzer/SpeechTranscriber do macOS 26,
/// que roda o modelo de fala da Apple no Neural Engine.
///
/// @unchecked: todos os stored properties são `let`; `append` só é chamado
/// sob o lock da CaptureSession, e `finish` só depois do último `append`.
final class Transcriber: @unchecked Sendable {
    private let analyzer: SpeechAnalyzer
    private let module: SpeechTranscriber
    private let inputBuilder: AsyncStream<AnalyzerInput>.Continuation
    private let inputFormat: AVAudioFormat
    private let analyzerFormat: AVAudioFormat
    private let converter: AVAudioConverter
    private let resultsTask: Task<Void, Never>
    // Flag do callback síncrono do AVAudioConverter; `append` é serializado
    // pelo lock da CaptureSession, então não há acesso concorrente real.
    private nonisolated(unsafe) var converterConsumed = false

    /// Cria o transcriber, baixando o modelo do idioma se ainda não estiver
    /// instalado (primeiro uso), e começa a escutar resultados.
    static func make(
        locale: Locale,
        onStatus: @escaping @Sendable (String) -> Void,
        onResult: @escaping @Sendable (TranscriptionResult) -> Void
    ) async throws -> Transcriber {
        let module = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: []
        )

        try await ensureModelInstalled(for: module, locale: locale, onStatus: onStatus)

        guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [module]) else {
            throw HostError("nenhum formato de áudio compatível com o SpeechTranscriber")
        }

        return try await Transcriber(
            module: module,
            analyzerFormat: analyzerFormat,
            onResult: onResult
        )
    }

    private static func ensureModelInstalled(
        for module: SpeechTranscriber,
        locale: Locale,
        onStatus: @escaping @Sendable (String) -> Void
    ) async throws {
        let supported = await SpeechTranscriber.supportedLocales
        let isSupported = supported.contains { candidate in
            candidate.identifier(.bcp47) == locale.identifier(.bcp47)
        }
        guard isSupported else {
            throw HostError("idioma não suportado pelo SpeechTranscriber: \(locale.identifier)")
        }

        guard let request = try await AssetInventory.assetInstallationRequest(supporting: [module]) else {
            return
        }
        onStatus("Baixando o modelo de fala de \(locale.identifier)…")
        try await request.downloadAndInstall()
        onStatus("Modelo de fala instalado.")
    }

    private init(
        module: SpeechTranscriber,
        analyzerFormat: AVAudioFormat,
        onResult: @escaping @Sendable (TranscriptionResult) -> Void
    ) async throws {
        guard let inputFormat = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: Double(CaptureSession.sampleRate),
            channels: 1,
            interleaved: true
        ) else {
            throw HostError("falha ao criar o formato de entrada PCM")
        }
        guard let converter = AVAudioConverter(from: inputFormat, to: analyzerFormat) else {
            throw HostError("falha ao criar o conversor de áudio para o formato do analyzer")
        }

        self.module = module
        self.inputFormat = inputFormat
        self.analyzerFormat = analyzerFormat
        self.converter = converter

        let (inputSequence, inputBuilder) = AsyncStream.makeStream(of: AnalyzerInput.self)
        self.inputBuilder = inputBuilder

        self.resultsTask = Task {
            do {
                for try await result in module.results {
                    let text = String(result.text.characters)
                    onResult(TranscriptionResult(text: text, isFinal: result.isFinal))
                }
            } catch {
                NativeMessaging.log("resultados encerraram com erro: \(error)")
            }
        }

        self.analyzer = SpeechAnalyzer(modules: [module])
        try await analyzer.start(inputSequence: inputSequence)
    }

    /// Recebe PCM Int16 mono 16 kHz cru, converte para o formato do analyzer
    /// e alimenta o stream de entrada.
    func append(pcm: Data) throws {
        let inputBuffer = try makeInputBuffer(from: pcm)
        let converted = try convert(inputBuffer)
        inputBuilder.yield(AnalyzerInput(buffer: converted))
    }

    /// Finaliza a sessão: fecha a entrada e espera o analyzer emitir os
    /// resultados finais pendentes.
    func finish() async {
        inputBuilder.finish()
        do {
            try await analyzer.finalizeAndFinishThroughEndOfInput()
        } catch {
            NativeMessaging.log("finalize falhou: \(error)")
        }
        resultsTask.cancel()
    }

    private func makeInputBuffer(from pcm: Data) throws -> AVAudioPCMBuffer {
        let frameCount = AVAudioFrameCount(pcm.count / CaptureSession.bytesPerSample)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: frameCount) else {
            throw HostError("falha ao alocar buffer de entrada")
        }
        buffer.frameLength = frameCount
        pcm.withUnsafeBytes { (bytes: UnsafeRawBufferPointer) in
            let destination = buffer.int16ChannelData![0]
            bytes.withMemoryRebound(to: Int16.self) { samples in
                destination.update(from: samples.baseAddress!, count: samples.count)
            }
        }
        return buffer
    }

    private func convert(_ buffer: AVAudioPCMBuffer) throws -> AVAudioPCMBuffer {
        let sameFormat = buffer.format == analyzerFormat
        if sameFormat {
            return buffer
        }

        let ratio = analyzerFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up))
        guard let converted = AVAudioPCMBuffer(pcmFormat: analyzerFormat, frameCapacity: capacity) else {
            throw HostError("falha ao alocar buffer convertido")
        }

        converterConsumed = false
        var conversionError: NSError?
        converter.convert(to: converted, error: &conversionError) { [self] _, inputStatus in
            if converterConsumed {
                inputStatus.pointee = .noDataNow
                return nil
            }
            converterConsumed = true
            inputStatus.pointee = .haveData
            return buffer
        }
        if let conversionError {
            throw HostError("conversão de áudio falhou: \(conversionError.localizedDescription)")
        }
        return converted
    }
}

struct HostError: Error, CustomStringConvertible {
    let description: String

    init(_ description: String) {
        self.description = description
    }
}
