import SwiftUI

public struct IOSPrimaryAction: View {
    @Environment(\.colorScheme) private var colorScheme
    public let title: String
    public let systemImage: String?
    public let isLoading: Bool
    public let isDisabled: Bool
    public let tint: Color?
    public let action: () -> Void

    public init(
        _ title: String,
        systemImage: String? = nil,
        isLoading: Bool = false,
        isDisabled: Bool = false,
        tint: Color? = nil,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.systemImage = systemImage
        self.isLoading = isLoading
        self.isDisabled = isDisabled
        self.tint = tint
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: IOSSpacing.tight) {
                if isLoading {
                    ProgressView()
                        .tint(.white)
                } else if let systemImage {
                    Image(systemName: systemImage)
                        .font(IOSTypography.headline)
                }
                Text(title)
                    .font(IOSTypography.headline)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .foregroundStyle(.white)
            .background(
                tint ?? IOSColor.teal(colorScheme),
                in: RoundedRectangle(cornerRadius: IOSCornerRadius.card, style: .continuous)
            )
            .opacity(isDisabled ? 0.6 : 1)
        }
        .buttonStyle(.plain)
        .disabled(isDisabled || isLoading)
    }
}
