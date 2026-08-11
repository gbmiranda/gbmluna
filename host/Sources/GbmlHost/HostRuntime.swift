import Foundation

/// Loop principal do host: lê mensagens do Chrome e roteia para os módulos.
///
/// Dual-mode por conexão: a primeira mensagem com "module" liga o modo
/// envelope; mensagens sem "module" seguem o contrato flat legado (que
/// pertence inteiro ao tradutor) — extensão velha e host novo convivem.
final class HostRuntime {
    static let version = "0.2.0"

    // Segura o encerramento do processo enquanto trabalho assíncrono roda.
    private let pendingWork = DispatchGroup()
    private let router = ModuleRouter()
    private let translator: TranslatorModule

    init() {
        translator = TranslatorModule(pendingWork: pendingWork)
        router.register(translator)
    }

    func run() {
        while let message = NativeMessaging.readMessage() {
            handle(message)
        }
        pendingWork.wait()
    }

    private func handle(_ message: [String: Any]) {
        guard let type = message["type"] as? String else {
            NativeMessaging.send(module: "core", ["type": "error", "message": "mensagem sem campo 'type'"])
            return
        }

        if let moduleName = message["module"] as? String {
            NativeMessaging.envelopeMode = true
            if moduleName == "core" {
                handleCore(type: type, message: message)
            } else {
                router.dispatch(moduleName: moduleName, type: type, message: message)
            }
            return
        }

        // Contrato flat legado: ping é do core; o resto é do tradutor.
        if type == "ping" {
            NativeMessaging.send(["type": "pong", "hostVersion": Self.version])
            return
        }
        translator.handle(type: type, message: message)
    }

    private func handleCore(type: String, message: [String: Any]) {
        switch type {
        case "ping":
            var payload: [String: Any] = [
                "type": "pong",
                "hostVersion": Self.version,
                "modules": router.names,
            ]
            if let requestId = message["requestId"] as? String {
                payload["requestId"] = requestId
            }
            NativeMessaging.send(module: "core", payload)
        default:
            NativeMessaging.send(module: "core", ["type": "error", "message": "tipo desconhecido no core: \(type)"])
        }
    }
}
