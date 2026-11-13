// swift-tools-version: 6.0
// AfishaKit — общая логика iOS-приложения, виджета и App Intents «Тамаши».
// Собирается и тестируется на macOS (`swift test`) без симулятора iOS.
import PackageDescription

// Swift 6: строгая проверка конкурентности включена языковым режимом пакета.
let strictConcurrency: [SwiftSetting] = []

let package = Package(
    name: "AfishaKit",
    defaultLocalization: "ru",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "AfishaKit", targets: ["AfishaAPI", "AfishaKit", "AfishaStore", "AfishaUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.8.0"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", from: "1.1.0"),
        .package(url: "https://github.com/apple/swift-http-types", from: "1.0.0"),
    ],
    targets: [
        // Клиент API, сгенерированный swift-openapi-generator из packages/contract/openapi.json
        // (Scripts/generate-api.sh). Код в Generated/ руками не правится.
        .target(
            name: "AfishaAPI",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
            ],
            exclude: ["openapi.json", "openapi-generator-config.yaml"]
        ),
        // Доменная логика: сервис API, фильтры, даты в TZ региона, форматирование, статусы, локализация.
        .target(
            name: "AfishaKit",
            dependencies: [
                "AfishaAPI",
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
                .product(name: "HTTPTypes", package: "swift-http-types"),
            ],
            resources: [.copy("Resources/Localizable.xcstrings")],
            swiftSettings: strictConcurrency
        ),
        // Офлайн-хранилище (SwiftData): избранное и кэш последних выдач.
        .target(
            name: "AfishaStore",
            dependencies: ["AfishaKit"],
            swiftSettings: strictConcurrency
        ),
        // Дизайн-система «Живой орнамент»: токены, шрифты, фирменные формы и компоненты.
        .target(
            name: "AfishaUI",
            dependencies: ["AfishaKit"],
            resources: [.process("Resources")],
            swiftSettings: strictConcurrency
        ),
        .testTarget(
            name: "AfishaKitTests",
            dependencies: ["AfishaKit", "AfishaAPI", "AfishaStore"],
            resources: [.copy("Fixtures")],
            swiftSettings: strictConcurrency
        ),
        .testTarget(
            name: "AfishaUITests",
            dependencies: ["AfishaUI", "AfishaKit"],
            exclude: ["__Snapshots__"],
            swiftSettings: strictConcurrency
        ),
    ]
)
