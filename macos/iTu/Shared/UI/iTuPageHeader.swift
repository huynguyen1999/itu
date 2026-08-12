import SwiftUI

struct iTuPinnedHeaderModifier<Header: View>: ViewModifier {
    private let header: Header

    init(@ViewBuilder header: () -> Header) {
        self.header = header()
    }

    func body(content: Content) -> some View {
        content.safeAreaInset(edge: .top, spacing: 0) {
            header
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(iTuTheme.canvas)
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(Color.white.opacity(0.12))
                        .frame(height: 1)
                }
        }
    }
}

extension View {
    func iTuPinnedHeader<Header: View>(@ViewBuilder _ header: () -> Header) -> some View {
        modifier(iTuPinnedHeaderModifier(header: header))
    }
}
