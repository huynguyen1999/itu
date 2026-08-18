import SwiftUI

public struct IOSIconButton: View {
    @Environment(\.colorScheme) private var colorScheme
    public let systemImage: String
    public let label: String
    public let tint: Color?
    public let size: CGFloat
    public let action: () -> Void

    public init(
        systemImage: String,
        label: String,
        tint: Color? = nil,
        size: CGFloat = IOSMetrics.minimumHitTarget,
        action: @escaping () -> Void
    ) {
        self.systemImage = systemImage
        self.label = label
        self.tint = tint
        self.size = size
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(IOSTypography.headline)
                .foregroundStyle(tint ?? IOSColor.teal(colorScheme))
                .frame(width: size, height: size)
                .background(
                    (tint ?? IOSColor.teal(colorScheme)).opacity(0.12),
                    in: Circle()
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
