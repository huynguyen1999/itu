import SwiftUI

public struct IOSInlineAction: View {
    @Environment(\.colorScheme) private var colorScheme
    public let title: String
    public let systemImage: String?
    public let tint: Color?
    public let action: () -> Void

    public init(
        _ title: String,
        systemImage: String? = nil,
        tint: Color? = nil,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.systemImage = systemImage
        self.tint = tint
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(IOSTypography.captionBold)
                }
                Text(title)
                    .font(IOSTypography.captionBold)
            }
            .foregroundStyle(tint ?? IOSColor.teal(colorScheme))
        }
        .buttonStyle(.plain)
    }
}
