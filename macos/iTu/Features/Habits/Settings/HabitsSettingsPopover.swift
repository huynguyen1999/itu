import SwiftUI

struct HabitsSettingsPopover: View {
    @Environment(AppModel.self) private var model

    init() {}

    public var body: some View {
        let settings = model.settingsStore

        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Habit Preferences")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("Day rollover cutoff")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Picker("", selection: Binding(
                    get: { settings.habitRolloverCutoff },
                    set: { settings.habitRolloverCutoff = $0 }
                )) {
                    Text("12:00 AM (Midnight)").tag("00:00")
                    Text("2:00 AM").tag("02:00")
                    Text("3:00 AM").tag("03:00")
                    Text("4:00 AM").tag("04:00")
                    Text("5:00 AM").tag("05:00")
                    Text("6:00 AM").tag("06:00")
                }
                .pickerStyle(.menu)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Habit sorting")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Text("Time block → Manual habit order")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkFaint)
            }
        }
        .padding(16)
        .frame(width: 270)
    }
}
