import Foundation

/// Loop principal do host: lê mensagens do Chrome e despacha para a sessão.
final class HostRuntime {
    static let version = "0.1.0"

    private var session: CaptureSession?
    // Segura o encerramento do processo enquanto start/stop assíncronos rodam.
    private let pendingWork = DispatchGroup()

    func run() {
        while let message = NativeMessaging.readMessage() {
            handle(message)
        }
        pendingWork.wait()
    }

    private func handle(_ message: [String: Any]) {
        guard let type = message["type"] as? String else {
            NativeMessaging.send(["type": "error", "message": "mensagem sem campo 'type'"])
            return
        }

        switch type {
        case "ping":
            NativeMessaging.send(["type": "pong", "hostVersion": Self.version])
        case "start":
            handleStart(message)
        case "audio":
            handleAudio(message)
        case "stop":
            handleStop()
        case "translation-status":
            handleTranslationStatus(message)
        default:
            NativeMessaging.send(["type": "error", "message": "tipo desconhecido: \(type)"])
        }
    }

    private func handleStart(_ message: [String: Any]) {
        guard session == nil else {
            NativeMessaging.send(["type": "error", "message": "já existe uma sessão ativa"])
            return
        }
        guard let targetLanguage = message["targetLanguage"] as? String else {
            NativeMessaging.send(["type": "error", "message": "start sem targetLanguage"])
            return
        }

        let newSession = CaptureSession(
            sourceLanguage: message["sourceLanguage"] as? String,
            targetLanguage: targetLanguage
        )
        session = newSession
        NativeMessaging.log("sessão iniciada (origem: \(newSession.sourceLanguage ?? "en-US"), alvo: \(targetLanguage))")

        pendingWork.enter()
        newSession.begin(
            onReady: { [pendingWork] in
                NativeMessaging.send(["type": "started"])
                pendingWork.leave()
            },
            onFailure: { [pendingWork] message in
                NativeMessaging.send(["type": "error", "message": message])
                pendingWork.leave()
            }
        )
    }

    private func handleAudio(_ message: [String: Any]) {
        guard let activeSession = session else {
            NativeMessaging.send(["type": "error", "message": "audio recebido sem sessão ativa"])
            return
        }
        guard let base64 = message["pcm"] as? String, let pcm = Data(base64Encoded: base64) else {
            NativeMessaging.send(["type": "error", "message": "chunk de áudio inválido"])
            return
        }
        activeSession.append(pcm: pcm)
    }

    private func handleTranslationStatus(_ message: [String: Any]) {
        guard let source = message["sourceLanguage"] as? String,
              let target = message["targetLanguage"] as? String else {
            NativeMessaging.send(["type": "error", "message": "translation-status sem sourceLanguage/targetLanguage"])
            return
        }
        pendingWork.enter()
        Task { [pendingWork] in
            let status = await Translator.availability(sourceLanguage: source, targetLanguage: target)
            NativeMessaging.send([
                "type": "translation-status",
                "sourceLanguage": source,
                "targetLanguage": target,
                "status": status,
            ])
            pendingWork.leave()
        }
    }

    private func handleStop() {
        guard let activeSession = session else {
            NativeMessaging.send(["type": "error", "message": "stop sem sessão ativa"])
            return
        }
        session = nil

        pendingWork.enter()
        Task { [pendingWork] in
            await activeSession.stop()
            NativeMessaging.log(String(format: "sessão encerrada: %.1fs de áudio", activeSession.secondsReceived))
            NativeMessaging.send([
                "type": "stopped",
                "bytesReceived": activeSession.bytesReceived,
                "secondsReceived": activeSession.secondsReceived,
            ])
            pendingWork.leave()
        }
    }
}
