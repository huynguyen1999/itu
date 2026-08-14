import SwiftUI

struct GymSettingsPopoverView: View {
    @Environment(AppModel.self) private var model

    private let restIntervals = [
        (30, "30s"),
        (60, "60s (1m)"),
        (90, "90s (1.5m)"),
        (120, "120s (2m)"),
        (180, "180s (3m)"),
        (240, "240s (4m)")
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Gym Preferences")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            Divider()

            // Units
            VStack(alignment: .leading, spacing: 6) {
                Text("Weight Unit")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Picker("Weight Unit", selection: Binding(
                    get: { model.gymPreferences.weightUnit },
                    set: { newUnit in
                        Task {
                            _ = await model.updateGymPreferences(patch: ["weightUnit": .string(newUnit)])
                        }
                    }
                )) {
                    Text("Kilograms (kg)").tag("KG")
                    Text("Pounds (lbs)").tag("LBS")
                }
                .pickerStyle(.menu)
                .labelsHidden()
            }

            // Default Rest Timer
            VStack(alignment: .leading, spacing: 6) {
                Text("Default Rest Timer")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Picker("Rest Timer", selection: Binding(
                    get: { model.gymPreferences.defaultRestSeconds },
                    set: { newSecs in
                        Task {
                            _ = await model.updateGymPreferences(patch: ["defaultRestSeconds": .number(Double(newSecs))])
                        }
                    }
                )) {
                    ForEach(restIntervals, id: \.0) { interval in
                        Text(interval.1).tag(interval.0)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
            }

            Toggle("Auto-start rest timer on set finish", isOn: Binding(
                get: { model.gymPreferences.autoStartRestTimer },
                set: { value in
                    Task {
                        _ = await model.updateGymPreferences(patch: ["autoStartRestTimer": .bool(value)])
                    }
                }
            ))
            .font(.system(size: 12))

            Toggle("Show RPE (Rate of Perceived Exertion)", isOn: Binding(
                get: { model.gymPreferences.showRpe },
                set: { value in
                    Task {
                        _ = await model.updateGymPreferences(patch: ["showRpe": .bool(value)])
                    }
                }
            ))
            .font(.system(size: 12))

            Divider()

            // Sounds
            VStack(alignment: .leading, spacing: 8) {
                Text("AUDIO CUES")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                Toggle("Rest timer countdown sound", isOn: Binding(
                    get: { model.gymPreferences.restSoundEnabled },
                    set: { value in
                        Task {
                            _ = await model.updateGymPreferences(patch: ["restSoundEnabled": .bool(value)])
                        }
                    }
                ))
                .font(.system(size: 12))

                Toggle("Set completion sound", isOn: Binding(
                    get: { model.gymPreferences.completionSoundEnabled },
                    set: { value in
                        Task {
                            _ = await model.updateGymPreferences(patch: ["completionSoundEnabled": .bool(value)])
                        }
                    }
                ))
                .font(.system(size: 12))
            }
        }
        .padding(16)
        .frame(width: 280)
    }
}
