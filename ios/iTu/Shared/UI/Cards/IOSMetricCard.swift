import SwiftUI

public struct IOSMetricCard: View {
    @Environment(\.colorScheme) private var colorScheme
    public let title: String
    public let value: String
    public let subtitle: String?
    public let icon: String?
    public let tint: Color?

    public init(
        title: String,
        value: String,
        subtitle: String? = nil,
        icon: String? = nil,
        tint: Color? = nil
    ) {
        self.title = title
        self.value = value
        self.subtitle = subtitle
        self.icon = icon
        self.tint = tint
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: IOSSpacing.tight) {
            HStack(spacing: IOSSpacing.micro) {
                if let icon {
                    Image(systemName: icon)
                        .font(IOSTypography.captionBold)
                        .foregroundStyle(tint ?? IOSColor.teal(colorScheme))
                }
                Text(title.uppercased())
                    .font(IOSTypography.kicker)
                    .tracking(0.8)
                    .foregroundStyle(IOSColor.inkDim(colorScheme))
            }
            Text(value)
                .font(IOSTypography.metric)
                .foregroundStyle(IOSColor.ink(colorScheme))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            if let subtitle {
                Text(subtitle)
                    .font(IOSTypography.caption)
                    .foregroundStyle(IOSColor.inkFaint(colorScheme))
                    .lineLimit(1)
            }
        }
        .padding(IOSSpacing.compact)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            IOSColor.surface(colorScheme),
            in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                .stroke(IOSColor.border(colorScheme), lineWidth: 1)
        }
    }
}
