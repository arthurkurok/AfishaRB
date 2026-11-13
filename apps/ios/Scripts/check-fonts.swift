#!/usr/bin/env swift
// Проверка шрифтов: наличие глифов башкирского алфавита и осей вариативности.
// Запуск: swift Scripts/check-fonts.swift <font.ttf> [<font.ttf> ...]
import CoreText
import Foundation

/// Тест-строка из docs/07-design.md §5 + весь алфавит особых букв в обоих регистрах.
let bashkirLetters = "ӘәҒғҘҙҠҡҢңӨөҪҫҮүҺһ"
let sample = "Әҙәбиәт, ҡурай, һөнәр, өмөт, ғүмер, ң, ҫү — Ә Ҙ Ҡ Һ Ө Ғ Ң Ҫ Ү"

func tagString(_ tag: Int) -> String {
    let bytes = [24, 16, 8, 0].map { UInt8((tag >> $0) & 0xFF) }
    return String(decoding: bytes, as: UTF8.self)
}

var failed = false
for path in CommandLine.arguments.dropFirst() {
    let url = URL(fileURLWithPath: path) as CFURL
    guard let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url) as? [CTFontDescriptor],
          let descriptor = descriptors.first else {
        print("✗ \(path): не удалось прочитать шрифт")
        failed = true
        continue
    }
    let font = CTFontCreateWithFontDescriptor(descriptor, 16, nil)
    let name = CTFontCopyPostScriptName(font) as String
    var missing: [Character] = []
    for character in bashkirLetters + sample {
        let utf16 = Array(String(character).utf16)
        var glyphs = [CGGlyph](repeating: 0, count: utf16.count)
        if !CTFontGetGlyphsForCharacters(font, utf16, &glyphs, utf16.count) || glyphs.contains(0) {
            if !character.isWhitespace, !",—".contains(character) { missing.append(character) }
        }
    }
    let axes = (CTFontCopyVariationAxes(font) as? [[CFString: Any]] ?? []).compactMap { axis -> String? in
        guard let id = axis[kCTFontVariationAxisIdentifierKey] as? Int else { return nil }
        let min = axis[kCTFontVariationAxisMinimumValueKey] as? Double ?? 0
        let max = axis[kCTFontVariationAxisMaximumValueKey] as? Double ?? 0
        return "\(tagString(id)) \(Int(min))–\(Int(max))"
    }
    if missing.isEmpty {
        print("✓ \(name): все башкирские буквы на месте; оси: \(axes.joined(separator: ", "))")
    } else {
        print("✗ \(name): нет глифов для \(String(missing))")
        failed = true
    }
}
exit(failed ? 1 : 0)
