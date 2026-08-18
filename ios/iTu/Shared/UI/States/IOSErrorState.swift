import SwiftUI

public struct IOSErrorState: View {
    @Environment(\.colorScheme) private var colorScheme
    public let message: String
    public let onRetry: (() -> Void)?

    public init(_ message: String, onRetry: (() -> Void)? = nil) {
        self.message = message
        self.onRetry = onRetry
    }

    public var body: some View {
        HStack(alignment: .top, spacing: IOSSpacing.compact) {
            Image(systemName: "exclamationmark.circle.fill")
                .font(IOSTypography.headline)
                .foregroundStyle(IOSColor.coral(colorScheme))

            VStack(alignment: .leading, spacing: IOSSpacing.micro) {
                Text("Something went wrong")
                    .font(IOSTypography.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(IOSColor.ink(colorScheme))
                Text(message)
                    .font(IOSTypography.caption)
                    .foregroundStyle(IOSColor.inkDim(colorScheme))
            }

            Spacer()

            if let onRetry {
                Button("Retry", action: onRetry)
                    .font(IOSTypography.captionBold)
                    .buttonStyle(.bordered)
                    .tint(IOSColor.coral(colorScheme))
            }
        }
        .padding(IOSSpacing.compact)
        .background(
            IOSColor.coralTint(colorScheme).opacity(0.4),
            in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                .stroke(IOSColor.coral(colorScheme).opacity(0.3), lineWidth: 1)
        }
    }
}
