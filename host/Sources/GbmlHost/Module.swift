import Foundation

/// Um módulo do host: dono de um namespace de mensagens do protocolo
/// (envelope {module, type} — docs/twoddd.md). Respostas saem por
/// NativeMessaging.send(module:) com o próprio nome; em modo envelope o campo
/// "module" vai junto, em modo flat fica de fora.
protocol HostModule: AnyObject {
    var name: String { get }
    func handle(type: String, message: [String: Any])
}
