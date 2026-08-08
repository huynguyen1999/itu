import SwiftUI

struct HabitsSettingsPopover: View {
    @Environment(AppModel.self) private var model

    init() {}

    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Habits Preferences")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            Divider()

            Text("Habit schedule, time blocks, and check-in options can be managed directly on the Habits page.")
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(16)
        .frame(width: 260)
    }
}
