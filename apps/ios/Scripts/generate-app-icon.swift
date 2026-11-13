#!/usr/bin/env swift
// Временная иконка приложения 1024×1024 из токенов: коралловый фон, медовый ромб, завиток ҡусҡар.
// Финальная многослойная иконка (Icon Composer, iOS 26) — задача дизайнера (docs/13-owner-tasks.md).
// Запуск: swift Scripts/generate-app-icon.swift <tokens.json> <AppIcon.appiconset>
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 3 else {
    print("Использование: generate-app-icon.swift <tokens.json> <AppIcon.appiconset>")
    exit(2)
}
let tokens = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[1]))) as! [String: Any]
let colors = tokens["color"] as! [String: Any]

func token(_ name: String) -> CGColor {
    let hex = ((colors[name] as! [String: Any])["$value"] as! String).replacingOccurrences(of: "#", with: "")
    let v = UInt32(hex, radix: 16)!
    return CGColor(srgbRed: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255, blue: CGFloat(v & 0xFF) / 255, alpha: 1)
}

let size = 1024
let space = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
                    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
let s = CGFloat(size)

// Фон — коралл
ctx.setFillColor(token("accent"))
ctx.fill(CGRect(x: 0, y: 0, width: s, height: s))

// Сетка маленьких ромбов-орнамента
ctx.setStrokeColor(CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 0.12))
ctx.setLineWidth(4)
let step: CGFloat = 128
var row = 0
var y: CGFloat = 0
while y <= s + step {
    var x: CGFloat = row % 2 == 0 ? 0 : step / 2
    while x <= s + step {
        let r: CGFloat = 22
        ctx.move(to: CGPoint(x: x, y: y - r))
        ctx.addLine(to: CGPoint(x: x + r, y: y))
        ctx.addLine(to: CGPoint(x: x, y: y + r))
        ctx.addLine(to: CGPoint(x: x - r, y: y))
        ctx.closePath()
        x += step
    }
    ctx.strokePath()
    y += step / 2
    row += 1
}

// Медовый ромб
let c = CGPoint(x: s / 2, y: s / 2)
let half: CGFloat = s * 0.36
ctx.setFillColor(token("honey"))
ctx.move(to: CGPoint(x: c.x, y: c.y + half))
ctx.addLine(to: CGPoint(x: c.x + half, y: c.y))
ctx.addLine(to: CGPoint(x: c.x, y: c.y - half))
ctx.addLine(to: CGPoint(x: c.x - half, y: c.y))
ctx.closePath()
ctx.fillPath()

// Ҡусҡар «рога»: два зеркальных завитка сходятся в стебель (росток) — классический мотив
ctx.setStrokeColor(token("ink"))
ctx.setLineWidth(s * 0.034)
ctx.setLineCap(.round)
ctx.setLineJoin(.round)
let turns = 1.35
let maxR = Double(s) * 0.11
let endAngle = -Double.pi / 3
let stemTop = CGPoint(x: c.x, y: c.y - s * 0.06)
let stemBottom = CGPoint(x: c.x, y: c.y - s * 0.24)
for mirror in [-1.0, 1.0] {
    let spiralCenter = CGPoint(x: c.x + CGFloat(mirror) * s * 0.115, y: c.y + s * 0.07)
    let startAngle = endAngle - turns * 2 * .pi
    for i in 0...240 {
        let t = Double(i) / 240
        let angle = startAngle + t * turns * 2 * .pi
        let x = cos(angle) * maxR * t * mirror * -1
        let p = CGPoint(x: spiralCenter.x + CGFloat(x), y: spiralCenter.y + CGFloat(sin(angle) * maxR * t))
        if i == 0 { ctx.move(to: p) } else { ctx.addLine(to: p) }
    }
    ctx.addQuadCurve(to: stemTop, control: CGPoint(x: c.x + CGFloat(mirror) * s * 0.02, y: c.y - s * 0.01))
    ctx.strokePath()
}
ctx.move(to: stemTop)
ctx.addLine(to: stemBottom)
ctx.strokePath()

let image = ctx.makeImage()!
let dir = URL(fileURLWithPath: args[2])
try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
let file = dir.appendingPathComponent("AppIcon-1024.png")
let dest = CGImageDestinationCreateWithURL(file as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, image, nil)
CGImageDestinationFinalize(dest)

let contents = """
{
  "images" : [
    { "filename" : "AppIcon-1024.png", "idiom" : "universal", "platform" : "ios", "size" : "1024x1024" }
  ],
  "info" : { "author" : "generate-app-icon.swift", "version" : 1 }
}

"""
try contents.write(to: dir.appendingPathComponent("Contents.json"), atomically: true, encoding: .utf8)
print("Иконка: \(file.path)")
