import SwiftUI

struct JournalSettingsPopover: View {
    @Environment(AppModel.self) private var model

    init() {}

    public var body: some View {
        let settings = model.settingsStore

        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Journal Preferences")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("Default Editor Mode")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Picker("", selection: Binding(
                    get: { settings.journalDefaultEditorMode },
                    set: { settings.journalDefaultEditorMode = $0 }
                )) {
                    Text("Live editing").tag("LIVE")
                    Text("Source / Markdown").tag("SOURCE")
                }
                .pickerStyle(.menu)
            }

            Toggle("Auto-create daily note", isOn: Binding(
                get: { settings.journalAutoCreateDailyNote },
                set: { settings.journalAutoCreateDailyNote = $0 }
            ))
            .font(.system(size: 12))

            Toggle("Auto-open today's note", isOn: Binding(
                get: { settings.journalAutoOpenTodayNote },
                set: { settings.journalAutoOpenTodayNote = $0 }
            ))
            .font(.system(size: 12))
        }
        .padding(16)
        .frame(width: 270)
    }
}
