import SwiftUI

public struct IOSHeroCard<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    private let gradient: LinearGradient?
    private let cornerRadius: CGFloat
    private let content: Content

    public init(
        gradient: LinearGradient? = nil,
        cornerRadius: CGFloat = IOSCornerRadius.hero,
        @ViewBuilder content: () -> Content
    ) {
        self.gradient = gradient
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    public var body: some View {
        content
            .padding(IOSSpacing.major)
            .frame(maxWidth: .infinity, alignment: .leading)
            .foregroundStyle(.white)
            .background(
                gradient ?? IOSColor.forestGradient(colorScheme),
                in: RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            )
            .shadow(
                color: IOSColor.forestDeep(colorScheme).opacity(0.35),
                radius: 12,
                y: 6
            )
    }
}
