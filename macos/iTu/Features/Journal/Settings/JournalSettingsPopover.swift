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
                    set: { newValue in
                        settings.journalDefaultEditorMode = newValue
                        Task { await model.updateJournalPreferences(["defaultEditorMode": .string(newValue)]) }
                    }
                )) {
                    Text("Live editing").tag("LIVE")
                    Text("Source / Markdown").tag("SOURCE")
                    Text("Preview").tag("PREVIEW")
                }
                .pickerStyle(.menu)
            }

            Toggle("Auto-create daily note", isOn: Binding(
                get: { settings.journalAutoCreateDailyNote },
                set: { newValue in
                    settings.journalAutoCreateDailyNote = newValue
                    Task { await model.updateJournalPreferences(["autoCreateDailyNote": .bool(newValue)]) }
                }
            ))
            .font(.system(size: 12))

            Toggle("Auto-open today's note", isOn: Binding(
                get: { settings.journalAutoOpenTodayNote },
                set: { newValue in
                    settings.journalAutoOpenTodayNote = newValue
                    Task { await model.updateJournalPreferences(["autoOpenTodayNote": .bool(newValue)]) }
                }
            ))
            .font(.system(size: 12))

            Picker("Week starts", selection: Binding(
                get: { settings.journalWeekStartDay },
                set: { newValue in
                    settings.journalWeekStartDay = newValue
                    Task { await model.updateJournalPreferences(["weekStartDay": .string(newValue)]) }
                }
            )) {
                Text("Monday").tag("MONDAY")
                Text("Sunday").tag("SUNDAY")
            }
            .pickerStyle(.menu)

            Toggle("Auto-create weekly review", isOn: Binding(
                get: { settings.journalAutoCreateWeeklyReview },
                set: { newValue in
                    settings.journalAutoCreateWeeklyReview = newValue
                    Task { await model.updateJournalPreferences(["autoCreateWeeklyReview": .bool(newValue)]) }
                }
            ))
            .font(.system(size: 12))
        }
        .padding(16)
        .frame(width: 270)
    }
}
