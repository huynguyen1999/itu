import SwiftUI

struct LearnSettingsPopover: View {
    @Environment(AppModel.self) private var model

    init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Learn Preferences")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            Divider()

            Text("Deck styling and study options can be managed directly on each deck details page.")
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(16)
        .frame(width: 260)
    }
}
