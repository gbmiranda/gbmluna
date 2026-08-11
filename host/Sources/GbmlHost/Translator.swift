import AppKit
import Foundation
import SwiftUI
import Translation

/// Tradução on-device com o Translation framework da Apple.
///
/// O framework só entrega a `TranslationSession` dentro do modifier SwiftUI
/// `.translationTask`; aqui uma janela invisível (alpha 0) hospeda essa view e
/// as traduções entram por uma fila FIFO — a closure do translationTask fica
/// viva consumindo a fila, o que mantém a sessão válida.
///
/// @unchecked: `window` só é tocado na main thread; o resto é `let`.
final class Translator: @unchecked Sendable {
    struct Request {
        let text: String
        let continuation: CheckedContinuation<String, Error>
    }

    private let requestBuilder: AsyncStream<Request>.Continuation
    private var window: NSWindow?

    /// `needsDownload`: o par de idiomas ainda não está instalado; o
    /// prepareTranslation vai mostrar o diálogo de download do sistema e a
    /// janela precisa ficar visível para isso.
    init(sourceLanguage: String, targetLanguage: String, needsDownload: Bool) {
        let (requests, requestBuilder) = AsyncStream.makeStream(of: Request.self)
        self.requestBuilder = requestBuilder

        let configuration = TranslationSession.Configuration(
            source: Locale.Language(identifier: sourceLanguage),
            target: Locale.Language(identifier: targetLanguage)
        )

        DispatchQueue.main.async {
            let pump = TranslationPumpView(
                configuration: configuration,
                requests: requests,
                needsDownload: needsDownload,
                onRevealRequest: { [weak self] in self?.revealWindow() },
                onConcealRequest: { [weak self] in self?.concealWindow() }
            )
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 360, height: 120),
                styleMask: [.titled],
                backing: .buffered,
                defer: false
            )
            window.title = "gbmulti language"
            window.contentView = NSHostingView(rootView: pump)
            window.alphaValue = 0
            // A view precisa estar "na tela" para o translationTask disparar.
            window.orderFrontRegardless()
            self.window = window
        }
    }

    /// Status do par de idiomas: "installed", "supported" (precisa baixar) ou
    /// "unsupported".
    static func availability(sourceLanguage: String, targetLanguage: String) async -> String {
        let availability = LanguageAvailability()
        let status = await availability.status(
            from: Locale.Language(identifier: sourceLanguage),
            to: Locale.Language(identifier: targetLanguage)
        )
        switch status {
        case .installed:
            return "installed"
        case .supported:
            return "supported"
        case .unsupported:
            return "unsupported"
        @unknown default:
            return "unsupported"
        }
    }

    func translate(_ text: String) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            requestBuilder.yield(Request(text: text, continuation: continuation))
        }
    }

    func shutdown() {
        requestBuilder.finish()
        DispatchQueue.main.async {
            self.window?.orderOut(nil)
            self.window = nil
        }
    }

    private func revealWindow() {
        DispatchQueue.main.async {
            guard let window = self.window else {
                return
            }
            window.alphaValue = 1
            window.center()
            NSApp.activate(ignoringOtherApps: true)
            window.makeKeyAndOrderFront(nil)
        }
    }

    private func concealWindow() {
        DispatchQueue.main.async {
            self.window?.alphaValue = 0
        }
    }
}

private struct TranslationPumpView: View {
    let configuration: TranslationSession.Configuration
    let requests: AsyncStream<Translator.Request>
    let needsDownload: Bool
    let onRevealRequest: @Sendable () -> Void
    let onConcealRequest: @Sendable () -> Void

    var body: some View {
        Text("Baixando idiomas de tradução…")
            .padding()
            .translationTask(configuration) { session in
                // A sessão só é usada dentro desta closure (sequencialmente);
                // o compilador não consegue provar isso sozinho.
                nonisolated(unsafe) let session = session
                if needsDownload {
                    onRevealRequest()
                    do {
                        try await session.prepareTranslation()
                    } catch {
                        NativeMessaging.log("download do par de idiomas falhou/recusado: \(error)")
                    }
                    onConcealRequest()
                }

                for await request in requests {
                    do {
                        let response = try await session.translate(request.text)
                        request.continuation.resume(returning: response.targetText)
                    } catch {
                        request.continuation.resume(throwing: error)
                    }
                }
            }
    }
}
