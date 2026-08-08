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

            Text("Skill mappings, earnings ledgers, and reward shop preferences are managed directly inside the Growth section.")
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(16)
        .frame(width: 260)
    }
}
