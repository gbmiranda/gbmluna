import Foundation

/// Framing do Native Messaging do Chrome: cada mensagem é um JSON UTF-8
/// precedido por 4 bytes de tamanho em little-endian.
///
/// stdout é reservado ao protocolo — qualquer log vai para stderr.
enum NativeMessaging {
    private static let headerSize = 4
    private static let writeLock = NSLock()

    static func readMessage() -> [String: Any]? {
        guard let header = readExactly(headerSize) else {
            return nil
        }
        let length = UInt32(littleEndian: header.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) })
        guard length > 0, let payload = readExactly(Int(length)) else {
            return nil
        }
        let object = try? JSONSerialization.jsonObject(with: payload)
        return object as? [String: Any]
    }

    static func send(_ message: [String: Any]) {
        guard let payload = try? JSONSerialization.data(withJSONObject: message) else {
            log("falha ao serializar mensagem: \(message)")
            return
        }
        var length = UInt32(payload.count).littleEndian
        let header = Data(bytes: &length, count: headerSize)

        // Transcrição e tradução respondem de tasks concorrentes; o frame
        // (header + payload) precisa sair inteiro para não corromper o stream.
        writeLock.lock()
        defer { writeLock.unlock() }
        FileHandle.standardOutput.write(header)
        FileHandle.standardOutput.write(payload)
    }

    static func log(_ text: String) {
        FileHandle.standardError.write(Data(("[gbml-host] " + text + "\n").utf8))
    }

    private static func readExactly(_ count: Int) -> Data? {
        var buffer = Data()
        while buffer.count < count {
            guard let chunk = try? FileHandle.standardInput.read(upToCount: count - buffer.count),
                  !chunk.isEmpty else {
                return nil
            }
            buffer.append(chunk)
        }
        return buffer
    }
}
