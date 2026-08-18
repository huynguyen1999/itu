import SwiftUI

public struct IOSSection<Content: View, Action: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    public let title: String
    public let subtitle: String?
    public let action: Action
    public let content: Content

    public init(
        title: String,
        subtitle: String? = nil,
        @ViewBuilder action: () -> Action = { EmptyView() },
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.subtitle = subtitle
        self.action = action()
        self.content = content()
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: IOSSpacing.compact) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(IOSTypography.headline)
                        .foregroundStyle(IOSColor.ink(colorScheme))
                    if let subtitle {
                        Text(subtitle)
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.inkDim(colorScheme))
                    }
                }
                Spacer()
                action
            }
            content
        }
    }
}
