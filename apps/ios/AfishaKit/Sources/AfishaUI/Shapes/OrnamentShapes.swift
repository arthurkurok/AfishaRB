import SwiftUI

/// Ромб — главный графический атом «Живого орнамента»: дата в ромбе, бейджи статуса, буллеты
/// (docs/07-design.md §6).
public struct Rhombus: Shape {
    /// Скругление вершин в долях от меньшей стороны.
    public var cornerRadius: CGFloat

    public init(cornerRadius: CGFloat = 0.08) {
        self.cornerRadius = cornerRadius
    }

    public func path(in rect: CGRect) -> Path {
        let top = CGPoint(x: rect.midX, y: rect.minY)
        let right = CGPoint(x: rect.maxX, y: rect.midY)
        let bottom = CGPoint(x: rect.midX, y: rect.maxY)
        let left = CGPoint(x: rect.minX, y: rect.midY)
        let radius = min(rect.width, rect.height) * cornerRadius
        var path = Path()
        path.move(to: CGPoint(x: (left.x + top.x) / 2, y: (left.y + top.y) / 2))
        path.addArc(tangent1End: top, tangent2End: right, radius: radius)
        path.addArc(tangent1End: right, tangent2End: bottom, radius: radius)
        path.addArc(tangent1End: bottom, tangent2End: left, radius: radius)
        path.addArc(tangent1End: left, tangent2End: top, radius: radius)
        path.closeSubpath()
        return path
    }
}

/// Завиток ҡусҡар — спираль-«улитка» (росток, рога, волна). Рисуется линией.
public struct KuskarCurl: Shape {
    /// Число витков спирали.
    public var turns: Double
    /// Зеркально (завиток в другую сторону).
    public var mirrored: Bool

    public init(turns: Double = 1.6, mirrored: Bool = false) {
        self.turns = turns
        self.mirrored = mirrored
    }

    public func path(in rect: CGRect) -> Path {
        // Архимедова спираль от центра наружу + «стебель» к нижнему краю
        let center = CGPoint(x: rect.midX, y: rect.minY + rect.height * 0.42)
        let maxRadius = min(rect.width, rect.height) * 0.38
        let steps = 90
        var path = Path()
        for index in 0...steps {
            let t = Double(index) / Double(steps)
            let angle = t * turns * 2 * .pi
            let radius = maxRadius * t
            let x = center.x + CGFloat(cos(angle)) * radius * (mirrored ? -1 : 1)
            let y = center.y + CGFloat(sin(angle)) * radius
            if index == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
        }
        let last = path.currentPoint ?? center
        path.addQuadCurve(
            to: CGPoint(x: rect.midX, y: rect.maxY),
            control: CGPoint(x: last.x, y: rect.maxY - rect.height * 0.1)
        )
        return path
    }
}

/// Прямоугольник постера со «срезом ҡусҡар»: один угол срезан вогнутым завитком — «почерк»
/// продукта на карточке события (docs/07-design.md §6).
public struct KuskarCutRectangle: Shape {
    public var cornerRadius: CGFloat
    /// Размер среза в долях от меньшей стороны.
    public var cutRatio: CGFloat

    public init(cornerRadius: CGFloat = Tokens.Radius.m, cutRatio: CGFloat = 0.22) {
        self.cornerRadius = cornerRadius
        self.cutRatio = cutRatio
    }

    public func path(in rect: CGRect) -> Path {
        let r = min(cornerRadius, min(rect.width, rect.height) / 2)
        let cut = min(rect.width, rect.height) * cutRatio
        var path = Path()
        // Верхний левый угол — скругление
        path.move(to: CGPoint(x: rect.minX + r, y: rect.minY))
        // Верхняя грань до среза
        path.addLine(to: CGPoint(x: rect.maxX - cut, y: rect.minY))
        // Срез: вогнутая дуга с маленьким завитком внутрь
        path.addCurve(
            to: CGPoint(x: rect.maxX, y: rect.minY + cut),
            control1: CGPoint(x: rect.maxX - cut * 0.15, y: rect.minY + cut * 0.05),
            control2: CGPoint(x: rect.maxX - cut * 0.55, y: rect.minY + cut * 0.75)
        )
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - r))
        path.addArc(tangent1End: CGPoint(x: rect.maxX, y: rect.maxY), tangent2End: CGPoint(x: rect.maxX - r, y: rect.maxY), radius: r)
        path.addLine(to: CGPoint(x: rect.minX + r, y: rect.maxY))
        path.addArc(tangent1End: CGPoint(x: rect.minX, y: rect.maxY), tangent2End: CGPoint(x: rect.minX, y: rect.maxY - r), radius: r)
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + r))
        path.addArc(tangent1End: CGPoint(x: rect.minX, y: rect.minY), tangent2End: CGPoint(x: rect.minX + r, y: rect.minY), radius: r)
        path.closeSubpath()
        return path
    }
}

/// Завиток, вписанный в срез постера: заполняет вырезанный угол орнаментом.
public struct KuskarCornerOrnament: Shape {
    public var cutRatio: CGFloat

    public init(cutRatio: CGFloat = 0.22) {
        self.cutRatio = cutRatio
    }

    public func path(in rect: CGRect) -> Path {
        let cut = min(rect.width, rect.height) * cutRatio
        let box = CGRect(x: rect.maxX - cut * 0.78, y: rect.minY + cut * 0.04, width: cut * 0.74, height: cut * 0.74)
        return KuskarCurl(turns: 1.4, mirrored: true).path(in: box)
    }
}

/// Кайма — орнаментальная полоса по краю, как по подолу и рукавам одежды: 4 pt цвета категории
/// с мелким ромбическим узором.
public struct KaimaBand: View {
    let color: Color
    let height: CGFloat

    public init(color: Color, height: CGFloat = 4) {
        self.color = color
        self.height = height
    }

    public var body: some View {
        Canvas { context, size in
            context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(color))
            // Узор из маленьких ромбов светлее основного цвета
            let step = size.height * 3
            var x: CGFloat = step / 2
            while x < size.width {
                let rhombus = Rhombus(cornerRadius: 0).path(in: CGRect(x: x - size.height / 2, y: 0, width: size.height, height: size.height))
                context.fill(rhombus, with: .color(.white.opacity(0.35)))
                x += step
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}

/// Фон-орнамент: сетка ромбов с завитками. Используется в иллюстрациях-заглушках.
public struct OrnamentPattern: View {
    let color: Color
    let density: CGFloat

    public init(color: Color, density: CGFloat = 28) {
        self.color = color
        self.density = density
    }

    public var body: some View {
        Canvas { context, size in
            let step = density
            var row = 0
            var y: CGFloat = 0
            while y < size.height + step {
                var x: CGFloat = row.isMultiple(of: 2) ? 0 : step / 2
                while x < size.width + step {
                    let rect = CGRect(x: x - step * 0.22, y: y - step * 0.22, width: step * 0.44, height: step * 0.44)
                    context.stroke(Rhombus(cornerRadius: 0).path(in: rect), with: .color(color), lineWidth: 1.2)
                    x += step
                }
                y += step / 2
                row += 1
            }
        }
        .accessibilityHidden(true)
    }
}
