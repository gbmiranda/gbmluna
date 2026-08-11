import AppKit
import Foundation

NativeMessaging.log("gbml-host \(HostRuntime.version) iniciado")

let application = NSApplication.shared
application.setActivationPolicy(.accessory)

// O loop de stdin bloqueia; roda numa thread própria para deixar a main thread
// com o run loop do AppKit — o Translation framework (janela SwiftUI invisível)
// precisa dele.
let readerThread = Thread {
    HostRuntime().run()
    NativeMessaging.log("stdin fechado, encerrando")
    DispatchQueue.main.async {
        exit(0)
    }
}
readerThread.name = "gbml-host.reader"
readerThread.start()

application.run()
