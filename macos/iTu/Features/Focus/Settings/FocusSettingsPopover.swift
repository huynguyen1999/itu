import SwiftUI

struct FocusSettingsPopover: View {
    @Environment(AppModel.self) private var model

    init() {}

    public var body: some View {
        let settings = model.settingsStore

        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Focus Settings")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)

                Divider()

                // Timer Section
                VStack(alignment: .leading, spacing: 8) {
                    Text("Timer")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(iTuTheme.inkFaint)

                    HStack {
                        Text("Default work duration")
                            .font(.system(size: 12))
                        Spacer()
                        TextField("Min", value: Binding(
                            get: { settings.focusSettings.defaultWorkMinutes },
                            set: { settings.focusSettings.defaultWorkMinutes = max(1, min(180, $0)) }
                        ), formatter: NumberFormatter())
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 50)
                        Text("min").font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim)
                    }

                    HStack {
                        Text("Short break")
                            .font(.system(size: 12))
                        Spacer()
                        TextField("Min", value: Binding(
                            get: { settings.focusSettings.shortBreakMinutes },
                            set: { settings.focusSettings.shortBreakMinutes = max(1, min(60, $0)) }
                        ), formatter: NumberFormatter())
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 50)
                        Text("min").font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim)
                    }

                    HStack {
                        Text("Long break")
                            .font(.system(size: 12))
                        Spacer()
                        TextField("Min", value: Binding(
                            get: { settings.focusSettings.longBreakMinutes },
                            set: { settings.focusSettings.longBreakMinutes = max(1, min(120, $0)) }
                        ), formatter: NumberFormatter())
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 50)
                        Text("min").font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim)
                    }
                }

                Divider()

                // Automation & Alerts
                VStack(alignment: .leading, spacing: 8) {
                    Text("Automation & Alerts")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(iTuTheme.inkFaint)

                    Toggle("Allow overtime", isOn: Binding(
                        get: { settings.focusSettings.overtimeEnabled },
                        set: { settings.focusSettings.overtimeEnabled = $0 }
                    ))
                    Toggle("Play finish sound", isOn: Binding(
                        get: { settings.focusSettings.finishSoundEnabled },
                        set: { settings.focusSettings.finishSoundEnabled = $0 }
                    ))
                    Toggle("Desktop notification", isOn: Binding(
                        get: { settings.focusSettings.desktopNotificationEnabled },
                        set: { settings.focusSettings.desktopNotificationEnabled = $0 }
                    ))
                    Toggle("Show timer in menu bar", isOn: Binding(
                        get: { settings.focusSettings.showMenuBarItem },
                        set: { settings.focusSettings.showMenuBarItem = $0 }
                    ))
                }

                Divider()

                // Focus Policy
                VStack(alignment: .leading, spacing: 8) {
                    Text("Focus Policy")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(iTuTheme.inkFaint)

                    Toggle("Enable Focus Policy", isOn: Binding(
                        get: { settings.focusSettings.focusPolicyEnabled },
                        set: { settings.focusSettings.focusPolicyEnabled = $0 }
                    ))
                }
            }
            .padding(16)
        }
        .frame(width: 300, height: 380)
    }
}
