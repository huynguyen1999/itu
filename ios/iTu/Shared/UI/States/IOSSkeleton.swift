import SwiftUI

public struct IOSSkeleton: View {
    @Environment(\.colorScheme) private var colorScheme
    public let height: CGFloat
    public let cornerRadius: CGFloat
    @State private var phase: CGFloat = 0

    public init(height: CGFloat = 16, cornerRadius: CGFloat = IOSCornerRadius.control) {
        self.height = height
        self.cornerRadius = cornerRadius
    }

    public var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(
                LinearGradient(
                    colors: [
                        IOSColor.surfaceMuted(colorScheme),
                        IOSColor.borderSoft(colorScheme),
                        IOSColor.surfaceMuted(colorScheme)
                    ],
                    startPoint: UnitPoint(x: phase - 1, y: 0.5),
                    endPoint: UnitPoint(x: phase, y: 0.5)
                )
            )
            .frame(height: height)
            .onAppear {
                withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) {
                    phase = 2
                }
            }
    }
}
