import SwiftUI

public struct IOSActionCard: View {
    @Environment(\.colorScheme) private var colorScheme
    public let title: String
    public let subtitle: String?
    public let systemImage: String
    public let tint: Color?
    public let action: () -> Void

    public init(
        title: String,
        subtitle: String? = nil,
        systemImage: String,
        tint: Color? = nil,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.subtitle = subtitle
        self.systemImage = systemImage
        self.tint = tint
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: IOSSpacing.normal) {
                Image(systemName: systemImage)
                    .font(IOSTypography.headline)
                    .foregroundStyle(tint ?? IOSColor.teal(colorScheme))
                    .frame(width: 36, height: 36)
                    .background(
                        (tint ?? IOSColor.teal(colorScheme)).opacity(0.12),
                        in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous)
                    )
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
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(IOSColor.inkFaint(colorScheme))
            }
            .padding(IOSSpacing.normal)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                IOSColor.surface(colorScheme),
                in: RoundedRectangle(cornerRadius: IOSCornerRadius.card, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: IOSCornerRadius.card, style: .continuous)
                    .stroke(IOSColor.border(colorScheme), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }
}
