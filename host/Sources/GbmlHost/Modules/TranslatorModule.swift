import Foundation

/// Módulo do tradutor: absorve o contrato original do host
/// (start/audio/stop/translation-status), agora atrás do roteador de módulos.
///
/// @unchecked: `session` só é tocado na thread do reader (todo `handle` roda
/// nela); as Tasks assíncronas capturam a sessão e valores imutáveis.
final class TranslatorModule: HostModule, @unchecked Sendable {
    static let moduleName = "translator"

    let name = TranslatorModule.moduleName

    private var session: CaptureSession?
    // Segura o encerramento do processo enquanto start/stop assíncronos rodam.
    private let pendingWork: DispatchGroup

    init(pendingWork: DispatchGroup) {
        self.pendingWork = pendingWork
    }

    func handle(type: String, message: [String: Any]) {
        switch type {
        case "start":
            handleStart(message)
        case "audio":
            handleAudio(message)
        case "stop":
            handleStop(message)
        case "translation-status":
            handleTranslationStatus(message)
        default:
            reply(["type": "error", "message": "tipo desconhecido: \(type)"], to: message)
        }
    }

    private func handleStart(_ message: [String: Any]) {
        guard let targetLanguage = message["targetLanguage"] as? String else {
            reply(["type": "error", "message": "start sem targetLanguage"], to: message)
            return
        }
        let sourceLanguage = message["sourceLanguage"] as? String

        if let active = session {
            // Idempotência: repetir o start da sessão vigente confirma em vez
            // de falhar; parâmetros diferentes continuam sendo erro real.
            if active.sourceLanguage == sourceLanguage && active.targetLanguage == targetLanguage {
                reply(["type": "started"], to: message)
            } else {
                reply(["type": "error", "message": "já existe uma sessão ativa"], to: message)
            }
            return
        }

        let newSession = CaptureSession(
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage
        )
        session = newSession
        NativeMessaging.log("sessão iniciada (origem: \(sourceLanguage ?? "en-US"), alvo: \(targetLanguage))")

        let requestId = message["requestId"] as? String
        pendingWork.enter()
        newSession.begin(
            onReady: { [pendingWork] in
                Self.send(["type": "started"], requestId: requestId)
                pendingWork.leave()
            },
            onFailure: { [pendingWork] failure in
                Self.send(["type": "error", "message": failure], requestId: requestId)
                pendingWork.leave()
            }
        )
    }

    private func handleAudio(_ message: [String: Any]) {
        guard let activeSession = session else {
            reply(["type": "error", "message": "audio recebido sem sessão ativa"], to: message)
            return
        }
        guard let base64 = message["pcm"] as? String, let pcm = Data(base64Encoded: base64) else {
            reply(["type": "error", "message": "chunk de áudio inválido"], to: message)
            return
        }
        activeSession.append(pcm: pcm)
    }

    private func handleStop(_ message: [String: Any]) {
        guard let activeSession = session else {
            // Idempotência: parar sem sessão confirma o estado já parado.
            reply(["type": "stopped", "bytesReceived": 0, "secondsReceived": 0.0], to: message)
            return
        }
        session = nil

        let requestId = message["requestId"] as? String
        pendingWork.enter()
        Task { [pendingWork] in
            await activeSession.stop()
            NativeMessaging.log(String(format: "sessão encerrada: %.1fs de áudio", activeSession.secondsReceived))
            Self.send([
                "type": "stopped",
                "bytesReceived": activeSession.bytesReceived,
                "secondsReceived": activeSession.secondsReceived,
            ], requestId: requestId)
            pendingWork.leave()
        }
    }

    private func handleTranslationStatus(_ message: [String: Any]) {
        guard let source = message["sourceLanguage"] as? String,
              let target = message["targetLanguage"] as? String else {
            reply(["type": "error", "message": "translation-status sem sourceLanguage/targetLanguage"], to: message)
            return
        }
        let requestId = message["requestId"] as? String
        pendingWork.enter()
        Task { [pendingWork] in
            let status = await Translator.availability(sourceLanguage: source, targetLanguage: target)
            Self.send([
                "type": "translation-status",
                "sourceLanguage": source,
                "targetLanguage": target,
                "status": status,
            ], requestId: requestId)
            pendingWork.leave()
        }
    }

    /// Resposta direta a uma mensagem: ecoa o requestId quando presente.
    private func reply(_ body: [String: Any], to request: [String: Any]) {
        Self.send(body, requestId: request["requestId"] as? String)
    }

    private static func send(_ body: [String: Any], requestId: String?) {
        var payload = body
        if let requestId {
            payload["requestId"] = requestId
        }
        NativeMessaging.send(module: moduleName, payload)
    }
}
