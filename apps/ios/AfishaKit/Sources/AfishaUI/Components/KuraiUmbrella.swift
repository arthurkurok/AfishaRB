import SwiftUI

/// Элемент «зонтика курая»: категория с цветом, подписью и счётчиком.
public struct KuraiRay: Identifiable, Hashable, Sendable {
    public let id: String
    public let kind: CategoryMotifKind
    public let title: String
    public let count: Int?

    public init(id: String, kind: CategoryMotifKind, title: String, count: Int?) {
        self.id = id
        self.kind = kind
        self.title = title
        self.count = count
    }
}

/// «Зонтик курая» — фирменный навигатор категорий (docs/07-design.md §7).
///
/// Курай — зонтичное растение: лучи расходятся от одной точки, на концах лучей — иконки категорий
/// в ромбах. Семилепестковый цветок в круге не используется (элемент госсимволики РБ).
/// На телефоне — горизонтальная лента лучей; на крупном шрифте (AX) — вертикальный список,
/// чтобы подписи не обрезались.
public struct KuraiUmbrella: View {
    let rays: [KuraiRay]
    let selected: Set<String>
    let countFormatter: (Int) -> String
    let onSelect: (KuraiRay) -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    public init(rays: [KuraiRay], selected: Set<String> = [], countFormatter: @escaping (Int) -> String, onSelect: @escaping (KuraiRay) -> Void) {
        self.rays = rays
        self.selected = selected
        self.countFormatter = countFormatter
        self.onSelect = onSelect
    }

    /// Ширина ячейки луча.
    private let cell: CGFloat = 92
    private let spacing: CGFloat = 4
    private let iconSize: CGFloat = 56

    public var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: Tokens.Space.s2) {
                ForEach(rays) { ray in
                    Button { onSelect(ray) } label: {
                        HStack(spacing: Tokens.Space.s3) {
                            CategoryRhombusIcon(ray.kind, size: 48, selected: selected.contains(ray.id))
                            Text(ray.title)
                                .typography(TypeScale.title)
                                .foregroundStyle(Palette.ink)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                        }
                        .frame(minHeight: Tokens.Touch.minIos)
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(label(for: ray))
                    .accessibilityAddTraits(selected.contains(ray.id) ? [.isButton, .isSelected] : .isButton)
                }
            }
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                strip
            }
            .scrollClipDisabled()
        }
    }

    /// Лента лучей без прокрутки.
    var strip: some View {
        HStack(alignment: .top, spacing: spacing) {
            ForEach(rays) { ray in
                rayCell(ray)
            }
        }
        .padding(.horizontal, Tokens.Space.s4)
        .padding(.bottom, 26)
        .background(alignment: .topLeading) { umbel }
    }

    /// Лучи соцветия: из общей точки под лентой к каждому ромбу.
    private var umbel: some View {
        Canvas { context, size in
            guard !rays.isEmpty else { return }
            let hub = CGPoint(x: size.width / 2, y: size.height - 2)
            let line = Tokens.Palette.ink2.light
            for (index, ray) in rays.enumerated() {
                let x = Tokens.Space.s4 + CGFloat(index) * (cell + spacing) + cell / 2
                let end = CGPoint(x: x, y: iconSize)
                var path = Path()
                path.move(to: hub)
                path.addQuadCurve(to: end, control: CGPoint(x: (hub.x + x) / 2, y: hub.y - 6))
                context.stroke(path, with: .color(ray.kind.color.color.opacity(0.55)), style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
            }
            // Стебель и узел зонтика
            var stem = Path()
            stem.move(to: hub)
            stem.addLine(to: CGPoint(x: hub.x, y: size.height + 30))
            context.stroke(stem, with: .color(Color(rgb: line).opacity(0.4)), lineWidth: 1.5)
            context.fill(Rhombus(cornerRadius: 0).path(in: CGRect(x: hub.x - 5, y: hub.y - 5, width: 10, height: 10)), with: .color(Palette.honey))
        }
        .accessibilityHidden(true)
    }

    private func rayCell(_ ray: KuraiRay) -> some View {
        let isSelected = selected.contains(ray.id)
        return Button { onSelect(ray) } label: {
            VStack(spacing: Tokens.Space.s1) {
                CategoryRhombusIcon(ray.kind, size: iconSize, selected: isSelected)
                Text(ray.title)
                    .typography(TypeScale.caption, weight: 600)
                    .foregroundStyle(Palette.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .minimumScaleFactor(0.85)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Palette.bg))
                if let count = ray.count {
                    Text(countFormatter(count))
                        .typography(TypeScale.caption)
                        .foregroundStyle(Palette.ink2)
                        .padding(.horizontal, 4)
                        .background(RoundedRectangle(cornerRadius: 6).fill(Palette.bg))
                }
            }
            .frame(width: cell)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label(for: ray))
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    private func label(for ray: KuraiRay) -> String {
        guard let count = ray.count else { return ray.title }
        return "\(ray.title), \(countFormatter(count))"
    }
}
