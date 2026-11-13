import AppKit
import CoreGraphics
import Foundation
import ImageIO
import SwiftUI
import Testing
import UniformTypeIdentifiers

/// Минимальные снапшот-тесты без сторонних зависимостей: SwiftUI-вид рендерится через
/// ImageRenderer на macOS, PNG сравнивается с эталоном в `__Snapshots__` с допуском.
///
/// Эталон записывается, если его нет или задано `SNAPSHOT_RECORD=1`. Шрифты, цвета и формы
/// дизайн-системы одинаковы на macOS и iOS, поэтому регрессии компонентов видны и без симулятора;
/// снапшоты целых экранов на iOS — задача XCUITest на CI с установленным runtime.
@MainActor
enum Snapshot {
    static let directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("__Snapshots__")

    /// Доля различающихся пикселей, при которой тест падает.
    static let tolerance = 0.01

    static func assert<V: View>(
        _ view: V, named name: String, width: CGFloat, height: CGFloat? = nil,
        dark: Bool = false, dynamicType: DynamicTypeSize = .large,
        sourceLocation: SourceLocation = #_sourceLocation
    ) {
        let content = view
            .environment(\.colorScheme, dark ? .dark : .light)
            .environment(\.dynamicTypeSize, dynamicType)
            .frame(width: width, height: height)
            .fixedSize(horizontal: false, vertical: height == nil)
            .background(dark ? Color(white: 0.09) : Color(white: 0.965))

        let renderer = ImageRenderer(content: content)
        renderer.scale = 2
        var image: CGImage?
        // Динамические NSColor токенов разрешаются по текущему «рисующему» оформлению
        NSAppearance(named: dark ? .darkAqua : .aqua)?.performAsCurrentDrawingAppearance {
            image = renderer.cgImage
        }
        guard let image else {
            Issue.record("Не удалось отрисовать \(name)", sourceLocation: sourceLocation)
            return
        }

        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let reference = directory.appendingPathComponent("\(name).png")
        let record = ProcessInfo.processInfo.environment["SNAPSHOT_RECORD"] == "1"
        guard !record, let stored = load(reference) else {
            write(image, to: reference)
            return
        }
        let difference = diff(image, stored)
        if difference > tolerance {
            write(image, to: directory.appendingPathComponent("\(name).failure.png"))
            Issue.record("Снапшот \(name) отличается на \(String(format: "%.2f", difference * 100)) %", sourceLocation: sourceLocation)
        }
    }

    static func load(_ url: URL) -> CGImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }

    static func write(_ image: CGImage, to url: URL) {
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { return }
        CGImageDestinationAddImage(destination, image, nil)
        CGImageDestinationFinalize(destination)
    }

    /// Доля пикселей, отличающихся больше чем на 8/255 по любому каналу.
    static func diff(_ lhs: CGImage, _ rhs: CGImage) -> Double {
        guard lhs.width == rhs.width, lhs.height == rhs.height else { return 1 }
        let a = rgba(lhs), b = rgba(rhs)
        var differing = 0
        for pixel in stride(from: 0, to: a.count, by: 4) {
            for channel in 0..<4 where abs(Int(a[pixel + channel]) - Int(b[pixel + channel])) > 8 {
                differing += 1
                break
            }
        }
        return Double(differing) / Double(lhs.width * lhs.height)
    }

    static func rgba(_ image: CGImage) -> [UInt8] {
        var buffer = [UInt8](repeating: 0, count: image.width * image.height * 4)
        buffer.withUnsafeMutableBytes { pointer in
            let context = CGContext(
                data: pointer.baseAddress, width: image.width, height: image.height, bitsPerComponent: 8,
                bytesPerRow: image.width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
            )
            context?.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        }
        return buffer
    }
}
