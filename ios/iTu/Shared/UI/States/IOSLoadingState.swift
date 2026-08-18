import SwiftUI

public struct IOSLoadingState: View {
    @Environment(\.colorScheme) private var colorScheme
    public let message: String

    public init(_ message: String = "Loading...") {
        self.message = message
    }

    public var body: some View {
        VStack(spacing: IOSSpacing.compact) {
            ProgressView()
                .tint(IOSColor.teal(colorScheme))
            Text(message)
                .font(IOSTypography.subheadline)
                .foregroundStyle(IOSColor.inkDim(colorScheme))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, IOSSpacing.major)
    }
}
