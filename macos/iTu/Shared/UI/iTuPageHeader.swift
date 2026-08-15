import SwiftUI

struct iTuPageHeader<Actions: View, Controls: View>: View {
    private let kicker: String?
    private let title: String
    private let description: String?
    private let actions: () -> Actions
    private let controls: () -> Controls

    init(
        kicker: String? = nil,
        title: String,
        description: String? = nil,
        @ViewBuilder actions: @escaping () -> Actions,
        @ViewBuilder controls: @escaping () -> Controls
    ) {
        self.kicker = kicker
        self.title = title
        self.description = description
        self.actions = actions
        self.controls = controls
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .bottom, spacing: 16) {
                    identity
                    Spacer(minLength: 12)
                    actions()
                }
                VStack(alignment: .leading, spacing: 12) {
                    identity
                    actions()
                }
            }

            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { controls() }
                VStack(alignment: .leading, spacing: 8) { controls() }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
        .padding(.vertical, 18)
        .background {
            ZStack {
                LinearGradient(
                    colors: [iTuTheme.forest, iTuTheme.forestDeep],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
                RadialGradient(
                    colors: [iTuTheme.mint.opacity(0.18), .clear],
                    center: .topTrailing,
                    startRadius: 12,
                    endRadius: 360
                )
            }
        }
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(iTuTheme.pageHeaderDivider)
                .frame(height: 1)
        }
    }

    private var identity: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let kicker {
                iTuSectionLabel(title: kicker, color: iTuTheme.pageHeaderKicker)
            }
            Text(title)
                .font(.system(size: 28, weight: .bold))
                .foregroundStyle(iTuTheme.pageHeaderForeground)
                .lineLimit(nil)
                .fixedSize(horizontal: false, vertical: true)
            if let description {
                Text(description)
                    .font(.system(size: 13))
                    .foregroundStyle(iTuTheme.pageHeaderForegroundMuted)
                    .lineLimit(nil)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension iTuPageHeader where Actions == EmptyView, Controls == EmptyView {
    init(kicker: String? = nil, title: String, description: String? = nil) {
        self.init(kicker: kicker, title: title, description: description, actions: { EmptyView() }, controls: { EmptyView() })
    }
}

extension iTuPageHeader where Controls == EmptyView {
    init(kicker: String? = nil, title: String, description: String? = nil, @ViewBuilder actions: @escaping () -> Actions) {
        self.init(kicker: kicker, title: title, description: description, actions: actions, controls: { EmptyView() })
    }
}

extension iTuPageHeader where Actions == EmptyView {
    init(kicker: String? = nil, title: String, description: String? = nil, @ViewBuilder controls: @escaping () -> Controls) {
        self.init(kicker: kicker, title: title, description: description, actions: { EmptyView() }, controls: controls)
    }
}

struct iTuPinnedHeaderModifier<Header: View>: ViewModifier {
    private let header: Header

    init(@ViewBuilder header: () -> Header) {
        self.header = header()
    }

    func body(content: Content) -> some View {
        content.safeAreaInset(edge: .top, spacing: 0) {
            header
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

extension View {
    func iTuPinnedHeader<Header: View>(@ViewBuilder _ header: () -> Header) -> some View {
        modifier(iTuPinnedHeaderModifier(header: header))
    }
}
