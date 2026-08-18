import SwiftUI

public struct IOSPageHeader<Actions: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    public let kicker: String?
    public let title: String
    public let subtitle: String?
    public let actions: Actions

    public init(
        kicker: String? = nil,
        title: String,
        subtitle: String? = nil,
        @ViewBuilder actions: () -> Actions = { EmptyView() }
    ) {
        self.kicker = kicker
        self.title = title
        self.subtitle = subtitle
        self.actions = actions()
    }

    public var body: some View {
        HStack(alignment: .top, spacing: IOSSpacing.tight) {
            VStack(alignment: .leading, spacing: IOSSpacing.micro) {
                if let kicker {
                    Text(kicker.uppercased())
                        .font(IOSTypography.kicker)
                        .tracking(1.2)
                        .foregroundStyle(IOSColor.teal(colorScheme))
                }
                Text(title)
                    .font(IOSTypography.largeTitle)
                    .tracking(-0.4)
                    .foregroundStyle(IOSColor.ink(colorScheme))
                if let subtitle {
                    Text(subtitle)
                        .font(IOSTypography.subheadline)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                }
            }
            Spacer()
            actions
        }
        .padding(.vertical, IOSSpacing.micro)
    }
}
