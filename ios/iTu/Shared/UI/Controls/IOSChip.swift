import SwiftUI

public struct IOSChip: View {
    @Environment(\.colorScheme) private var colorScheme
    public let title: String
    public let icon: String?
    public let isSelected: Bool
    public let tint: Color?
    public let action: () -> Void

    public init(
        title: String,
        icon: String? = nil,
        isSelected: Bool = false,
        tint: Color? = nil,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.icon = icon
        self.isSelected = isSelected
        self.tint = tint
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: IOSSpacing.micro) {
                if let icon {
                    Image(systemName: icon)
                        .font(IOSTypography.captionBold)
                }
                Text(title)
                    .font(IOSTypography.captionBold)
            }
            .padding(.horizontal, IOSSpacing.compact)
            .padding(.vertical, 7)
            .foregroundStyle(
                isSelected
                    ? .white
                    : (tint ?? IOSColor.ink(colorScheme))
            )
            .background(
                isSelected
                    ? (tint ?? IOSColor.teal(colorScheme))
                    : (tint ?? IOSColor.surface(colorScheme)).opacity(0.12),
                in: Capsule()
            )
            .overlay {
                if !isSelected {
                    Capsule()
                        .stroke(IOSColor.border(colorScheme), lineWidth: 1)
                }
            }
        }
        .buttonStyle(.plain)
    }
}
