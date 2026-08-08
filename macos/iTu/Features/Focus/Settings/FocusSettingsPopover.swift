import SwiftUI

struct FocusSettingsPopover: View {
    @Environment(AppModel.self) private var model

    init() {}

    public var body: some View {
        let settings = model.settingsStore

        FeatureSettingsPopoverShell(title: "Focus settings") {
            FeatureSettingsSection(title: "Timer Durations") {
                FeatureSettingsRow(label: "Work duration") {
                    HStack(spacing: 4) {
                        TextField("Min", value: Binding(
                            get: { settings.focusSettings.defaultWorkMinutes },
                            set: { settings.focusSettings.defaultWorkMinutes = max(1, min(180, $0)) }
                        ), formatter: NumberFormatter())
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 50)
                        Text("min").font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim)
                    }
                }

                FeatureSettingsRow(label: "Short break") {
                    HStack(spacing: 4) {
                        TextField("Min", value: Binding(
                            get: { settings.focusSettings.shortBreakMinutes },
                            set: { settings.focusSettings.shortBreakMinutes = max(1, min(60, $0)) }
                        ), formatter: NumberFormatter())
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 50)
                        Text("min").font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim)
                    }
                }

                FeatureSettingsRow(label: "Long break") {
                    HStack(spacing: 4) {
                        TextField("Min", value: Binding(
                            get: { settings.focusSettings.longBreakMinutes },
                            set: { settings.focusSettings.longBreakMinutes = max(1, min(120, $0)) }
                        ), formatter: NumberFormatter())
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 50)
                        Text("min").font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim)
                    }
                }

                FeatureSettingsRow(label: "Cycles before long break") {
                    TextField("Cycles", value: Binding(
                        get: { settings.focusSettings.cyclesBeforeLongBreak },
                        set: { settings.focusSettings.cyclesBeforeLongBreak = max(1, min(20, $0)) }
                    ), formatter: NumberFormatter())
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 50)
                }
            }

            FeatureSettingsSection(title: "Automation & Alerts") {
                Toggle("Auto-start breaks", isOn: Binding(
                    get: { settings.focusSettings.autoStartBreaks },
                    set: { settings.focusSettings.autoStartBreaks = $0 }
                ))
                Toggle("Auto-start work", isOn: Binding(
                    get: { settings.focusSettings.autoStartWork },
                    set: { settings.focusSettings.autoStartWork = $0 }
                ))
                Toggle("Allow overtime", isOn: Binding(
                    get: { settings.focusSettings.overtimeEnabled },
                    set: { settings.focusSettings.overtimeEnabled = $0 }
                ))
                Toggle("Play finish chime sound", isOn: Binding(
                    get: { settings.focusSettings.finishSoundEnabled },
                    set: { settings.focusSettings.finishSoundEnabled = $0 }
                ))
                Toggle("Desktop notifications", isOn: Binding(
                    get: { settings.focusSettings.desktopNotificationEnabled },
                    set: { settings.focusSettings.desktopNotificationEnabled = $0 }
                ))
                Toggle("Show timer in menu bar", isOn: Binding(
                    get: { settings.focusSettings.showMenuBarItem },
                    set: { settings.focusSettings.showMenuBarItem = $0 }
                ))
            }

            FeatureSettingsSection(title: "Focus Policy (App Blocking)") {
                Toggle("Enable Focus Policy app blocking", isOn: Binding(
                    get: { settings.focusSettings.focusPolicyEnabled },
                    set: { settings.focusSettings.focusPolicyEnabled = $0 }
                ))
            }
        }
    }
}
