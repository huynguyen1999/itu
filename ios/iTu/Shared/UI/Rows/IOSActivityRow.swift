import SwiftUI

public struct IOSActivityRow: View {
    @Environment(\.colorScheme) private var colorScheme
    public let timestamp: String
    public let title: String
    public let subtitle: String?
    public let badge: String?
    public let badgeTint: Color?

    public init(
        timestamp: String,
        title: String,
        subtitle: String? = nil,
        badge: String? = nil,
        badgeTint: Color? = nil
    ) {
        self.timestamp = timestamp
        self.title = title
        self.subtitle = subtitle
        self.badge = badge
        self.badgeTint = badgeTint
    }

    public var body: some View {
        HStack(alignment: .top, spacing: IOSSpacing.compact) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(IOSTypography.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(IOSColor.ink(colorScheme))
                if let subtitle {
                    Text(subtitle)
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                if let badge {
                    Text(badge)
                        .font(IOSTypography.captionBold)
                        .foregroundStyle(badgeTint ?? IOSColor.teal(colorScheme))
                }
                Text(timestamp)
                    .font(IOSTypography.caption)
                    .foregroundStyle(IOSColor.inkFaint(colorScheme))
            }
        }
        .padding(.horizontal, IOSSpacing.normal)
        .padding(.vertical, IOSSpacing.compact)
        .background(
            IOSColor.surface(colorScheme),
            in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                .stroke(IOSColor.borderSoft(colorScheme), lineWidth: 1)
        }
    }
}
