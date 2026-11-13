// Сгенерировано Scripts/generate-tokens.swift из packages/design-tokens/tokens.json.
// Не править вручную: измените токены и перезапустите `make tokens`.
// swiftlint:disable all
import SwiftUI

/// Дизайн-токены «Живой орнамент» (docs/07-design.md).
public enum Tokens {
    /// Цвета: светлая тема — «холст», тёмная — «бархат».
    public enum Palette {
        /// Холст / бархат
        public static let bg = ThemeColor(light: 0xF6F0E4, dark: 0x16120F)
        public static let surface = ThemeColor(light: 0xFFFFFF, dark: 0x231D18)
        public static let surface2 = ThemeColor(light: 0xEFE6D6, dark: 0x2E2620)
        public static let ink = ThemeColor(light: 0x16120F, dark: 0xF6F0E4)
        public static let ink2 = ThemeColor(light: 0x5C5047, dark: 0xBFB3A5)
        public static let line = ThemeColor(light: 0xDDD2C0, dark: 0x3A3029)
        /// Коралл — основное действие
        public static let accent = ThemeColor(light: 0xB8322A, dark: 0xF07A68)
        public static let onAccent = ThemeColor(light: 0xFFFFFF, dark: 0x16120F)
        /// Шафран — только фон под тёмным текстом
        public static let honey = ThemeColor(light: 0xE8A92E, dark: 0xE8A92E)
        public static let meadow = ThemeColor(light: 0x2F7A4B, dark: 0x6CC08A)
        public static let focus = ThemeColor(light: 0x2E64A8, dark: 0x7FA9E8)
        public enum Category {
            public static let theatre = ThemeColor(light: 0xB8322A, dark: 0xB8322A)
            public static let music = ThemeColor(light: 0x2E64A8, dark: 0x2E64A8)
            public static let museum = ThemeColor(light: 0x8F6209, dark: 0x8F6209)
            public static let kids = ThemeColor(light: 0xA84A14, dark: 0xA84A14)
            public static let folk = ThemeColor(light: 0x2F7A4B, dark: 0x2F7A4B)
            public static let cinema = ThemeColor(light: 0x6B3A6E, dark: 0x6B3A6E)
            public static let education = ThemeColor(light: 0x1F6B70, dark: 0x1F6B70)
        }
        public enum Status {
            public static let rescheduled = ThemeColor(light: 0x2E64A8, dark: 0x7FA9E8)
            public static let cancelled = ThemeColor(light: 0xB8322A, dark: 0xF07A68)
            public static let ended = ThemeColor(light: 0x5C5047, dark: 0xBFB3A5)
            public static let fewLeft = ThemeColor(light: 0xE8A92E, dark: 0xE8A92E)
            public static let unverified = ThemeColor(light: 0x8F6209, dark: 0xE8A92E)
        }
    }

    /// Семейства шрифтов с запасными вариантами.
    public enum FontFamily {
        public static let display: [String] = ["Commissioner", "Golos Text", "system-ui", "sans-serif"]
        public static let text: [String] = ["Golos Text", "system-ui", "sans-serif"]
    }

    /// Шкала типографики (pt при стандартном размере Dynamic Type).
    public enum Typography {
        public static let display = TypeToken(name: "display", size: 40.0, lineHeight: 44.0, weight: 700, family: .display)
        public static let h1 = TypeToken(name: "h1", size: 28.0, lineHeight: 32.0, weight: 700, family: .display)
        public static let h2 = TypeToken(name: "h2", size: 22.0, lineHeight: 28.0, weight: 600, family: .display)
        public static let title = TypeToken(name: "title", size: 18.0, lineHeight: 24.0, weight: 600, family: .text)
        public static let body = TypeToken(name: "body", size: 16.0, lineHeight: 24.0, weight: 400, family: .text)
        public static let caption = TypeToken(name: "caption", size: 13.0, lineHeight: 18.0, weight: 500, family: .text)
        public static let dateBig = TypeToken(name: "date-big", size: 32.0, lineHeight: 32.0, weight: 800, family: .display)
    }

    /// Радиусы скругления.
    public enum Radius {
        public static let s: CGFloat = 8.0
        public static let m: CGFloat = 14.0
        public static let l: CGFloat = 22.0
        public static let pill: CGFloat = 999.0
    }

    /// Сетка отступов 4 pt.
    public enum Space {
        public static let s1: CGFloat = 4.0
        public static let s2: CGFloat = 8.0
        public static let s3: CGFloat = 12.0
        public static let s4: CGFloat = 16.0
        public static let s5: CGFloat = 24.0
        public static let s6: CGFloat = 32.0
        public static let s7: CGFloat = 48.0
    }

    /// Минимальные размеры области касания.
    public enum Touch {
        public static let minIos: CGFloat = 44.0
        public static let minAndroid: CGFloat = 48.0
    }

    /// Длительности анимаций (секунды) и фирменная кривая.
    public enum Motion {
        public static let fast: Double = 0.12
        public static let base: Double = 0.22
        public static let slow: Double = 0.36
        public static let easing = BezierCurve(x1: 0.2, y1: 0.8, x2: 0.2, y2: 1.0)
    }
}
