import SwiftUI

public struct IOSCard<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    private let cornerRadius: CGFloat
    private let padding: CGFloat
    private let content: Content

    public init(
        cornerRadius: CGFloat = IOSCornerRadius.card,
        padding: CGFloat = IOSSpacing.normal,
        @ViewBuilder content: () -> Content
    ) {
        self.cornerRadius = cornerRadius
        self.padding = padding
        self.content = content()
    }

    public var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                IOSColor.surface(colorScheme),
                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(IOSColor.border(colorScheme), lineWidth: 1)
            }
            .shadow(
                color: IOSColor.forest(colorScheme).opacity(colorScheme == .dark ? 0.25 : 0.05),
                radius: 8,
                y: 3
            )
    }
}
