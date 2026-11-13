import SwiftUI

/// Состояния маскота — подмножество из 12 эмоций брифа (docs/07-design.md §3),
/// нужное мобильному Гиду.
public enum BeeMood: String, CaseIterable, Sendable {
    /// Приветствие (машет).
    case hello
    /// Думает (кружит по завитку).
    case thinking
    /// Нашла.
    case found
    /// Уточняет (наклон головы, вопрос из ромбов).
    case asking
    /// Не нашла (разводит лапками).
    case notFound
    /// Ошибка сети (ищет сигнал).
    case offline
}

/// Пчела Бал — проводник Гида. Временная векторная версия в коде: тело медового янтаря без
/// чёрных полос, коралловый поясок-ҡусҡар, полупрозрачные крылья с прожилками-ромбами.
/// Финальные ассеты (Lottie/Rive) — задача иллюстратора (docs/13-owner-tasks.md).
public struct BeeMascot: View {
    let mood: BeeMood
    let size: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: Double = 0

    public init(mood: BeeMood = .hello, size: CGFloat = 64) {
        self.mood = mood
        self.size = size
    }

    public var body: some View {
        BeeFigure(mood: mood)
            .frame(width: size, height: size)
            .rotationEffect(.degrees(tilt))
            .offset(orbitOffset)
            .opacity(reduceMotion && mood == .thinking ? 0.55 + 0.45 * abs(cos(phase * .pi)) : 1)
            .onAppear(perform: startAnimation)
            .onChange(of: mood) { _, _ in startAnimation() }
            .accessibilityHidden(true)
    }

    private var tilt: Double {
        switch mood {
        case .asking: -12
        case .notFound: 6
        case .hello: reduceMotion ? 0 : sin(phase * .pi * 2) * 6
        default: 0
        }
    }

    /// «Думает» — полёт по маленькой спирали-ҡусҡару; при Reduce Motion — только мерцание прозрачности.
    private var orbitOffset: CGSize {
        guard mood == .thinking, !reduceMotion else { return .zero }
        let angle = phase * .pi * 2
        let radius = size * 0.06 * (0.6 + 0.4 * sin(angle / 2))
        return CGSize(width: cos(angle) * radius, height: sin(angle) * radius)
    }

    private func startAnimation() {
        phase = 0
        guard mood == .thinking || mood == .hello else { return }
        withAnimation(.linear(duration: mood == .thinking ? 1.6 : 2.4).repeatForever(autoreverses: false)) {
            phase = 1
        }
    }
}

/// Статичная фигура пчелы (используется и в анимированном маскоте, и в снапшотах).
struct BeeFigure: View {
    let mood: BeeMood

    var body: some View {
        Canvas { context, size in
            let s = min(size.width, size.height) / 100
            func r(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect { CGRect(x: x * s, y: y * s, width: w * s, height: h * s) }
            let honey = Color(rgb: Tokens.Palette.honey.light)
            let honeyLight = Color(rgb: 0xFFFFFF).opacity(0.35)
            let coral = Color(rgb: Tokens.Palette.accent.light)
            let ink = Color(rgb: Tokens.Palette.ink.light)

            // Крылья — полупрозрачные, с прожилками-ромбами
            for (x, rotation) in [(CGFloat(22), -24.0), (CGFloat(52), 24.0)] {
                var wing = context
                let rect = r(x, 8, 28, 34)
                wing.translateBy(x: rect.midX, y: rect.midY)
                wing.rotate(by: .degrees(rotation))
                let local = CGRect(x: -rect.width / 2, y: -rect.height / 2, width: rect.width, height: rect.height)
                wing.fill(Path(ellipseIn: local), with: .color(Color(rgb: Tokens.Palette.focus.dark).opacity(0.35)))
                wing.stroke(Path(ellipseIn: local), with: .color(ink.opacity(0.5)), lineWidth: 1.2 * s)
                let vein = Rhombus(cornerRadius: 0).path(in: local.insetBy(dx: local.width * 0.3, dy: local.height * 0.3))
                wing.stroke(vein, with: .color(ink.opacity(0.35)), lineWidth: 0.8 * s)
            }

            // Тело
            let body = Path(ellipseIn: r(18, 30, 64, 58))
            context.fill(body, with: .color(honey))
            context.fill(Path(ellipseIn: r(26, 34, 30, 18)), with: .color(honeyLight))
            context.stroke(body, with: .color(ink.opacity(0.8)), lineWidth: 1.6 * s)

            // Поясок-ҡусҡар вместо полос
            var belt = context
            belt.clip(to: body)
            belt.fill(Path(r(10, 68, 80, 5)), with: .color(coral))
            for i in 0..<5 {
                let curl = KuskarCurl(turns: 1.2, mirrored: i.isMultiple(of: 2)).path(in: r(24 + CGFloat(i) * 11, 73, 9, 9))
                belt.stroke(curl, with: .color(coral), lineWidth: 1.4 * s)
            }

            // Глаза
            let eyeY: CGFloat = mood == .asking ? 46 : 48
            for x in [CGFloat(36), 56] {
                context.fill(Path(ellipseIn: r(x, eyeY, 11, 13)), with: .color(.white))
                context.stroke(Path(ellipseIn: r(x, eyeY, 11, 13)), with: .color(ink.opacity(0.7)), lineWidth: 1 * s)
                let pupilShift: CGFloat = mood == .thinking ? 2.5 : (mood == .offline ? -1.5 : 0.5)
                context.fill(Path(ellipseIn: r(x + 3 + pupilShift, eyeY + 3.5, 5.5, 6.5)), with: .color(ink))
                context.fill(Path(ellipseIn: r(x + 4.2 + pupilShift, eyeY + 4.2, 1.8, 1.8)), with: .color(.white))
            }

            // Рот: улыбка или «разводит руками» — ровная линия
            var mouth = Path()
            switch mood {
            case .notFound, .offline:
                mouth.move(to: CGPoint(x: 45 * s, y: 66 * s))
                mouth.addQuadCurve(to: CGPoint(x: 55 * s, y: 66 * s), control: CGPoint(x: 50 * s, y: 64 * s))
            default:
                mouth.move(to: CGPoint(x: 44 * s, y: 64 * s))
                mouth.addQuadCurve(to: CGPoint(x: 56 * s, y: 64 * s), control: CGPoint(x: 50 * s, y: 69 * s))
            }
            context.stroke(mouth, with: .color(ink), style: StrokeStyle(lineWidth: 1.8 * s, lineCap: .round))

            // Усики с ромбиками на концах
            for (from, to) in [((CGFloat(42), CGFloat(32)), (CGFloat(34), CGFloat(16))), ((58, 32), (66, 16))] {
                var antenna = Path()
                antenna.move(to: CGPoint(x: from.0 * s, y: from.1 * s))
                antenna.addQuadCurve(to: CGPoint(x: to.0 * s, y: to.1 * s), control: CGPoint(x: (from.0 + to.0) / 2 * s, y: 18 * s))
                context.stroke(antenna, with: .color(ink), style: StrokeStyle(lineWidth: 1.6 * s, lineCap: .round))
                context.fill(Rhombus(cornerRadius: 0).path(in: r(to.0 - 3.5, to.1 - 3.5, 7, 7)), with: .color(coral))
            }

            // Атрибуты состояния
            switch mood {
            case .found:
                // Держит карточку
                let card = Path(roundedRect: r(66, 56, 24, 18), cornerRadius: 3 * s)
                context.fill(card, with: .color(.white))
                context.stroke(card, with: .color(ink.opacity(0.7)), lineWidth: 1.2 * s)
                context.fill(Path(r(66, 70, 24, 4)), with: .color(coral))
            case .asking:
                // Вопрос из ромбов
                for (i, point) in [(80, 14), (86, 18), (86, 25), (81, 30), (81, 40)].enumerated() {
                    let side: CGFloat = i == 4 ? 5 : 4
                    context.fill(Rhombus(cornerRadius: 0).path(in: r(CGFloat(point.0), CGFloat(point.1), side, side)), with: .color(coral))
                }
            case .notFound:
                // Разведённые лапки
                for (x1, x2) in [(CGFloat(20), CGFloat(6)), (80, 94)] {
                    var arm = Path()
                    arm.move(to: CGPoint(x: x1 * s, y: 62 * s))
                    arm.addLine(to: CGPoint(x: x2 * s, y: 54 * s))
                    context.stroke(arm, with: .color(ink), style: StrokeStyle(lineWidth: 1.8 * s, lineCap: .round))
                }
            case .offline:
                // Ищет сигнал: дуги над головой
                for radius in [CGFloat(6), 11] {
                    var arc = Path()
                    arc.addArc(center: CGPoint(x: 86 * s, y: 26 * s), radius: radius * s, startAngle: .degrees(200), endAngle: .degrees(340), clockwise: false)
                    context.stroke(arc, with: .color(ink.opacity(0.6)), style: StrokeStyle(lineWidth: 1.6 * s, lineCap: .round))
                }
            case .hello:
                var arm = Path()
                arm.move(to: CGPoint(x: 80 * s, y: 58 * s))
                arm.addQuadCurve(to: CGPoint(x: 92 * s, y: 40 * s), control: CGPoint(x: 92 * s, y: 54 * s))
                context.stroke(arm, with: .color(ink), style: StrokeStyle(lineWidth: 1.8 * s, lineCap: .round))
            case .thinking:
                break
            }
        }
    }
}
