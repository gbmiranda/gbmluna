import Foundation

/// Registro e despacho de módulos por nome. Módulo desconhecido responde erro
/// pelo core em vez de derrubar o processo — falha isolada não derruba o todo.
final class ModuleRouter {
    private var modules: [String: HostModule] = [:]

    var names: [String] {
        modules.keys.sorted()
    }

    func register(_ module: HostModule) {
        modules[module.name] = module
    }

    func dispatch(moduleName: String, type: String, message: [String: Any]) {
        guard let module = modules[moduleName] else {
            NativeMessaging.send(module: "core", [
                "type": "error",
                "message": "módulo desconhecido: \(moduleName)",
            ])
            return
        }
        module.handle(type: type, message: message)
    }
}
