import SwiftUI

struct JournalSettingsPopover: View {
    @Environment(AppModel.self) private var model

    init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Journal Preferences")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            Divider()

            Text("Daily and weekly note behavior and view layout options are managed inside the Journal workspace.")
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(16)
        .frame(width: 260)
    }
}
