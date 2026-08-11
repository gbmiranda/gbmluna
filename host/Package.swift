// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "GbmlHost",
    platforms: [
        .macOS("26.0")
    ],
    products: [
        .executable(name: "gbml-host", targets: ["GbmlHost"])
    ],
    targets: [
        .executableTarget(
            name: "GbmlHost",
            path: "Sources/GbmlHost"
        )
    ]
)
