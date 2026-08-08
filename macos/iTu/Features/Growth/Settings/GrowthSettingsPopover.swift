import SwiftUI

struct GrowthSettingsPopover: View {
    @Environment(AppModel.self) private var model

    init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Growth Preferences")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            Divider()

            Text("Celebration style, reward confirmation threshold, and XP curves are managed directly via Growth Settings in the Growth page.")
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(16)
        .frame(width: 270)
    }
}
