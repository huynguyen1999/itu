import SwiftUI

public struct IOSOfflineState: View {
    @Environment(\.colorScheme) private var colorScheme
    public let message: String

    public init(_ message: String = "This feature requires an active network connection.") {
        self.message = message
    }

    public var body: some View {
        HStack(spacing: IOSSpacing.compact) {
            Image(systemName: "wifi.slash")
                .font(IOSTypography.subheadline)
                .foregroundStyle(IOSColor.inkDim(colorScheme))
            Text(message)
                .font(IOSTypography.caption)
                .foregroundStyle(IOSColor.inkDim(colorScheme))
        }
        .padding(.horizontal, IOSSpacing.normal)
        .padding(.vertical, IOSSpacing.tight)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            IOSColor.surfaceMuted(colorScheme),
            in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous)
        )
    }
}
