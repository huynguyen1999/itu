import SwiftUI

public struct IOSPage<Content: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    private let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: IOSSpacing.section) {
                content
            }
            .padding(.horizontal, IOSSpacing.normal)
            .padding(.vertical, IOSSpacing.compact)
        }
        .scrollIndicators(.hidden)
        .background(IOSColor.canvas(colorScheme))
    }
}
