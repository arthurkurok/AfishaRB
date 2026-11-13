import SwiftUI

/// Мотивы-иконки категорий (docs/07-design.md §4.2): линейные, 2 pt, сетка 24 pt.
/// Временные векторные заглушки в коде — владелец заменит их ассетами иллюстратора
/// (docs/13-owner-tasks.md), сохранив API `CategoryMotif`.
public enum CategoryMotifKind: String, CaseIterable, Sendable {
    case theatre, music, museum, kids, folk, cinema, education

    public init(code: String) {
        self = CategoryMotifKind(rawValue: code) ?? .education
    }

    public var color: ThemeColor {
        switch self {
        case .theatre: Tokens.Palette.Category.theatre
        case .music: Tokens.Palette.Category.music
        case .museum: Tokens.Palette.Category.museum
        case .kids: Tokens.Palette.Category.kids
        case .folk: Tokens.Palette.Category.folk
        case .cinema: Tokens.Palette.Category.cinema
        case .education: Tokens.Palette.Category.education
        }
    }
}

/// Линейная иконка категории в квадрате 24×24 (масштабируется).
public struct CategoryMotif: Shape {
    public let kind: CategoryMotifKind

    public init(_ kind: CategoryMotifKind) {
        self.kind = kind
    }

    public func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 24
        let o = CGPoint(x: rect.midX - 12 * s, y: rect.midY - 12 * s)
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: o.x + x * s, y: o.y + y * s) }
        func box(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect { CGRect(x: o.x + x * s, y: o.y + y * s, width: w * s, height: h * s) }
        var path = Path()
        switch kind {
        case .theatre:
            // Маска из двух ҡусҡаров: овал маски, глаза-завитки, улыбка
            path.addPath(Path(roundedRect: box(4, 3, 16, 18), cornerRadius: 8 * s))
            path.addPath(KuskarCurl(turns: 1.1).path(in: box(6.5, 7, 5, 5)))
            path.addPath(KuskarCurl(turns: 1.1, mirrored: true).path(in: box(12.5, 7, 5, 5)))
            path.move(to: p(8, 15))
            path.addQuadCurve(to: p(16, 15), control: p(12, 19))
        case .music:
            // Курай-стебель со звуковыми волнами-завитками
            path.move(to: p(7, 21))
            path.addLine(to: p(13, 3))
            for i in 0..<3 {
                let y = 8 + CGFloat(i) * 4
                path.move(to: p(14, y))
                path.addQuadCurve(to: p(19, y - 1), control: p(17, y - 3))
            }
            path.addEllipse(in: box(9.2, 12.5, 1.6, 1.6))
            path.addEllipse(in: box(10.6, 8.3, 1.6, 1.6))
        case .museum:
            // Ромб-рамка: ромб в ромбе
            path.addPath(Rhombus(cornerRadius: 0.06).path(in: box(2, 2, 20, 20)))
            path.addPath(Rhombus(cornerRadius: 0.06).path(in: box(7.5, 7.5, 9, 9)))
        case .kids:
            // Солнышко-ҡусҡар: завиток в центре и лучи
            path.addPath(KuskarCurl(turns: 1.5).path(in: box(7, 6, 10, 10)))
            for i in 0..<8 {
                let angle = CGFloat(i) * .pi / 4
                let c = p(12, 11)
                path.move(to: CGPoint(x: c.x + cos(angle) * 8 * s, y: c.y + sin(angle) * 8 * s))
                path.addLine(to: CGPoint(x: c.x + cos(angle) * 10.5 * s, y: c.y + sin(angle) * 10.5 * s))
            }
        case .folk:
            // «Древо жизни» (ағас): ствол и симметричные ветви-завитки
            path.move(to: p(12, 22))
            path.addLine(to: p(12, 4))
            for (i, y) in [7, 11, 15].enumerated() {
                let w = CGFloat(6 - i)
                path.move(to: p(12, CGFloat(y) + 2))
                path.addQuadCurve(to: p(12 - w, CGFloat(y) - 1), control: p(12 - w * 0.4, CGFloat(y) + 2))
                path.move(to: p(12, CGFloat(y) + 2))
                path.addQuadCurve(to: p(12 + w, CGFloat(y) - 1), control: p(12 + w * 0.4, CGFloat(y) + 2))
            }
            path.addPath(Rhombus(cornerRadius: 0).path(in: box(10.5, 1.5, 3, 3)))
        case .cinema:
            // Ромб-кадр: ромб с перфорацией
            path.addPath(Rhombus(cornerRadius: 0.06).path(in: box(2, 2, 20, 20)))
            path.addRect(box(9, 9, 6, 6))
            for x in [5.5, 17.5] as [CGFloat] { path.addEllipse(in: box(x - 0.8, 11.2, 1.6, 1.6)) }
        case .education:
            // «Сердечко» йөрәккәй — знак гостеприимства
            path.move(to: p(12, 20))
            path.addCurve(to: p(3.5, 9), control1: p(7, 16.5), control2: p(3.5, 13))
            path.addCurve(to: p(12, 7.5), control1: p(3.5, 4.5), control2: p(10, 3.5))
            path.addCurve(to: p(20.5, 9), control1: p(14, 3.5), control2: p(20.5, 4.5))
            path.addCurve(to: p(12, 20), control1: p(20.5, 13), control2: p(17, 16.5))
            path.addPath(KuskarCurl(turns: 1.1).path(in: box(9.5, 8.5, 5, 5)))
        }
        return path
    }
}

/// Иконка категории в ромбе цвета категории — элемент «зонтика курая».
public struct CategoryRhombusIcon: View {
    let kind: CategoryMotifKind
    let size: CGFloat
    let selected: Bool

    public init(_ kind: CategoryMotifKind, size: CGFloat = 56, selected: Bool = false) {
        self.kind = kind
        self.size = size
        self.selected = selected
    }

    public var body: some View {
        ZStack {
            Rhombus(cornerRadius: 0.12)
                .fill(selected ? kind.color.color : Palette.surface)
            Rhombus(cornerRadius: 0.12)
                .stroke(kind.color.color, lineWidth: 2)
            CategoryMotif(kind)
                .stroke(selected ? Color.white : kind.color.color, style: StrokeStyle(lineWidth: 1.8, lineCap: .round, lineJoin: .round))
                .frame(width: size * 0.46, height: size * 0.46)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Фирменная иллюстрация категории — обложка, если у события нет фото (03 §1.5, п. 1).
/// Плоская геометрия, 3–4 цвета палитры, орнаментальный паттерн, без людей.
public struct CategoryIllustration: View {
    let kind: CategoryMotifKind
    let seed: Int

    /// `seed` разнообразит композицию у разных событий одной категории.
    public init(_ kind: CategoryMotifKind, seed: Int = 0) {
        self.kind = kind
        self.seed = seed
    }

    public var body: some View {
        GeometryReader { proxy in
            let size = proxy.size
            let base = kind.color.light
            ZStack {
                Color(rgb: base)
                OrnamentPattern(color: .white.opacity(0.12), density: max(22, size.width / 10))
                // Крупный ромб с мотивом категории
                let side = min(size.width, size.height) * 0.62
                let offsetX = CGFloat((seed % 3) - 1) * size.width * 0.18
                Rhombus(cornerRadius: 0.08)
                    .fill(Color(rgb: Tokens.Palette.honey.light).opacity(0.9))
                    .frame(width: side, height: side)
                    .offset(x: offsetX)
                CategoryMotif(kind)
                    .stroke(Color(rgb: Tokens.Palette.ink.light), style: StrokeStyle(lineWidth: max(1.5, side / 26), lineCap: .round, lineJoin: .round))
                    .frame(width: side * 0.5, height: side * 0.5)
                    .offset(x: offsetX)
                // Завитки по краям
                KuskarCurl(turns: 1.5)
                    .stroke(.white.opacity(0.55), style: StrokeStyle(lineWidth: 2, lineCap: .round))
                    .frame(width: side * 0.42, height: side * 0.5)
                    .position(x: size.width * 0.12, y: size.height * 0.72)
                KuskarCurl(turns: 1.5, mirrored: true)
                    .stroke(.white.opacity(0.55), style: StrokeStyle(lineWidth: 2, lineCap: .round))
                    .frame(width: side * 0.42, height: side * 0.5)
                    .position(x: size.width * 0.88, y: size.height * 0.3)
            }
        }
        .clipped()
        .accessibilityHidden(true)
    }
}
