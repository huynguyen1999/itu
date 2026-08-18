import SwiftUI

public struct IOSListRow<Accessory: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    public let icon: String?
    public let title: String
    public let subtitle: String?
    public let tint: Color?
    public let accessory: Accessory

    public init(
        icon: String? = nil,
        title: String,
        subtitle: String? = nil,
        tint: Color? = nil,
        @ViewBuilder accessory: () -> Accessory = { EmptyView() }
    ) {
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.tint = tint
        self.accessory = accessory()
    }

    public var body: some View {
        HStack(spacing: IOSSpacing.compact) {
            if let icon {
                Image(systemName: icon)
                    .font(IOSTypography.headline)
                    .foregroundStyle(tint ?? IOSColor.teal(colorScheme))
                    .frame(width: 32, height: 32)
                    .background(
                        (tint ?? IOSColor.teal(colorScheme)).opacity(0.12),
                        in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous)
                    )
            }
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
            accessory
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
