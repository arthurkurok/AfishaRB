#!/usr/bin/env swift
// Генератор Tokens.swift из packages/design-tokens/tokens.json (формат W3C DTCG).
// Запуск: swift Scripts/generate-tokens.swift <tokens.json> <Tokens.swift> [<Assets.xcassets>]
// С третьим аргументом также пишет colorset'ы AccentColor и LaunchBackground (экран запуска
// и системный акцент берут цвета только из токенов).
// Выход детерминирован (ключи сортируются в порядке исходного файла там, где это важно),
// поэтому повторный запуск без изменений токенов не меняет файл — CI может проверять дрейф.
import Foundation

struct GeneratorError: Error, CustomStringConvertible {
    let description: String
}

let args = CommandLine.arguments
guard args.count == 3 || args.count == 4 else {
    FileHandle.standardError.write("Использование: generate-tokens.swift <tokens.json> <Tokens.swift> [<Assets.xcassets>]\n".data(using: .utf8)!)
    exit(2)
}
let inputURL = URL(fileURLWithPath: args[1])
let outputURL = URL(fileURLWithPath: args[2])

let data = try Data(contentsOf: inputURL)
guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
    throw GeneratorError(description: "tokens.json: ожидался объект в корне")
}

/// Порядок ключей JSONSerialization не сохраняет — восстанавливаем его по позиции ключа в исходном тексте.
let sourceText = String(decoding: data, as: UTF8.self)
func ordered(_ dict: [String: Any]) -> [(String, Any)] {
    dict.map { ($0.key, $0.value) }.sorted { lhs, rhs in
        let l = sourceText.range(of: "\"\(lhs.0)\"")?.lowerBound ?? sourceText.endIndex
        let r = sourceText.range(of: "\"\(rhs.0)\"")?.lowerBound ?? sourceText.endIndex
        return l == r ? lhs.0 < rhs.0 : l < r
    }
}

/// «ink-2» → «ink2», «on-accent» → «onAccent», «1» → «s1».
func identifier(_ raw: String, numericPrefix: String = "s") -> String {
    let parts = raw.split(whereSeparator: { $0 == "-" || $0 == "_" }).map(String.init)
    var result = parts.enumerated().map { index, part in
        index == 0 ? part : part.prefix(1).uppercased() + part.dropFirst()
    }.joined()
    if let first = result.first, first.isNumber { result = numericPrefix + result }
    return result
}

func hex(_ value: String) throws -> String {
    let cleaned = value.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "#", with: "")
    guard cleaned.count == 6, UInt32(cleaned, radix: 16) != nil else {
        throw GeneratorError(description: "Неверный цвет: \(value)")
    }
    return "0x" + cleaned.uppercased()
}

var out = """
// Сгенерировано Scripts/generate-tokens.swift из packages/design-tokens/tokens.json.
// Не править вручную: измените токены и перезапустите `make tokens`.
// swiftlint:disable all
import SwiftUI

/// Дизайн-токены «Живой орнамент» (docs/07-design.md).
public enum Tokens {

"""

// MARK: Цвета

func emitColors(_ dict: [String: Any], indent: String) throws -> String {
    var s = ""
    for (key, value) in ordered(dict) {
        guard let token = value as? [String: Any] else { continue }
        if let light = token["$value"] as? String, (token["$type"] as? String) == "color" {
            let ext = token["$extensions"] as? [String: Any]
            let dark = (ext?["dark"] as? String) ?? ((ext?["mode"] as? [String: Any])?["dark"] as? String) ?? light
            if let description = token["$description"] as? String {
                s += "\(indent)/// \(description)\n"
            }
            s += "\(indent)public static let \(identifier(key)) = ThemeColor(light: \(try hex(light)), dark: \(try hex(dark)))\n"
        } else {
            let name = identifier(key)
            s += "\(indent)public enum \(name.prefix(1).uppercased() + name.dropFirst()) {\n"
            s += try emitColors(token, indent: indent + "    ")
            s += "\(indent)}\n"
        }
    }
    return s
}

if let colors = root["color"] as? [String: Any] {
    out += "    /// Цвета: светлая тема — «холст», тёмная — «бархат».\n"
    out += "    public enum Palette {\n"
    out += try emitColors(colors, indent: "        ")
    out += "    }\n\n"
}

// MARK: Шрифты

if let fonts = root["font"] as? [String: Any] {
    out += "    /// Семейства шрифтов с запасными вариантами.\n"
    out += "    public enum FontFamily {\n"
    for (key, value) in ordered(fonts) {
        guard let token = value as? [String: Any], let list = token["$value"] as? [String] else { continue }
        let literal = list.map { "\"\($0)\"" }.joined(separator: ", ")
        out += "        public static let \(identifier(key)): [String] = [\(literal)]\n"
    }
    out += "    }\n\n"
}

// MARK: Типографика

if let type = root["type"] as? [String: Any] {
    out += "    /// Шкала типографики (pt при стандартном размере Dynamic Type).\n"
    out += "    public enum Typography {\n"
    for (key, value) in ordered(type) {
        guard let token = value as? [String: Any],
              let size = token["size"] as? Double,
              let line = token["line"] as? Double,
              let weight = token["weight"] as? Double,
              let family = token["family"] as? String else { continue }
        out += "        public static let \(identifier(key)) = TypeToken(name: \"\(key)\", size: \(size), lineHeight: \(line), weight: \(Int(weight)), family: .\(identifier(family)))\n"
    }
    out += "    }\n\n"
}

// MARK: Радиусы, отступы, касание

func emitNumbers(_ name: String, _ doc: String, _ dict: [String: Any]) -> String {
    var s = "    /// \(doc)\n    public enum \(name) {\n"
    for (key, value) in ordered(dict) {
        guard let number = value as? Double else { continue }
        s += "        public static let \(identifier(key)): CGFloat = \(number)\n"
    }
    return s + "    }\n\n"
}

if let radius = root["radius"] as? [String: Any] { out += emitNumbers("Radius", "Радиусы скругления.", radius) }
if let space = root["space"] as? [String: Any] { out += emitNumbers("Space", "Сетка отступов 4 pt.", space) }
if let touch = root["touch"] as? [String: Any] { out += emitNumbers("Touch", "Минимальные размеры области касания.", touch) }

// MARK: Движение

if let motion = root["motion"] as? [String: Any] {
    out += "    /// Длительности анимаций (секунды) и фирменная кривая.\n"
    out += "    public enum Motion {\n"
    for (key, value) in ordered(motion) {
        if let ms = value as? Double {
            out += "        public static let \(identifier(key)): Double = \(ms / 1000)\n"
        } else if let curve = value as? String, curve.hasPrefix("cubic-bezier") {
            let numbers = curve
                .replacingOccurrences(of: "cubic-bezier(", with: "")
                .replacingOccurrences(of: ")", with: "")
                .split(separator: ",")
                .compactMap { Double($0.trimmingCharacters(in: .whitespaces)) }
            guard numbers.count == 4 else { throw GeneratorError(description: "Неверная кривая: \(curve)") }
            out += "        public static let \(identifier(key)) = BezierCurve(x1: \(numbers[0]), y1: \(numbers[1]), x2: \(numbers[2]), y2: \(numbers[3]))\n"
        }
    }
    out += "    }\n"
}

out += "}\n"

try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
let existing = try? String(contentsOf: outputURL, encoding: .utf8)
if existing == out {
    print("Tokens.swift не изменился")
} else {
    try out.write(to: outputURL, atomically: true, encoding: .utf8)
    print("Записан \(outputURL.path)")
}

// MARK: Colorset'ы для Asset Catalog

func colorComponents(_ hexValue: String) -> String {
    let cleaned = hexValue.replacingOccurrences(of: "#", with: "")
    let value = UInt32(cleaned, radix: 16) ?? 0
    let r = Double((value >> 16) & 0xFF) / 255, g = Double((value >> 8) & 0xFF) / 255, b = Double(value & 0xFF) / 255
    return String(format: "\"red\" : \"%.3f\", \"green\" : \"%.3f\", \"blue\" : \"%.3f\", \"alpha\" : \"1.000\"", r, g, b)
}

func colorset(light: String, dark: String) -> String {
    """
    {
      "colors" : [
        { "color" : { "color-space" : "srgb", "components" : { \(colorComponents(light)) } }, "idiom" : "universal" },
        { "appearances" : [ { "appearance" : "luminosity", "value" : "dark" } ], "color" : { "color-space" : "srgb", "components" : { \(colorComponents(dark)) } }, "idiom" : "universal" }
      ],
      "info" : { "author" : "generate-tokens.swift", "version" : 1 }
    }

    """
}

if args.count == 4, let colors = root["color"] as? [String: Any] {
    let assets = URL(fileURLWithPath: args[3])
    for (name, tokenName) in [("AccentColor", "accent"), ("LaunchBackground", "bg")] {
        guard let token = colors[tokenName] as? [String: Any], let light = token["$value"] as? String else { continue }
        let dark = ((token["$extensions"] as? [String: Any])?["dark"] as? String) ?? light
        let dir = assets.appendingPathComponent("\(name).colorset")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try colorset(light: light, dark: dark).write(to: dir.appendingPathComponent("Contents.json"), atomically: true, encoding: .utf8)
    }
    print("Записаны colorset'ы в \(assets.path)")
}
