// swift-tools-version: 6.0
// Инструментальный пакет: фиксирует версию swift-openapi-generator для генерации клиента
// «заранее» (ahead-of-time). Запуск — через ../../Scripts/generate-api.sh.
import PackageDescription

let package = Package(
    name: "OpenAPIGen",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.6.0"),
    ],
    targets: []
)
