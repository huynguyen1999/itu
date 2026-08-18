import SwiftUI
import iTuDomain
import iTuDesignCore

public struct GrowthSettingsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss

    @State private var accountBaseXP: String
    @State private var rewardPreset: RewardPreset
    @State private var celebrationStyle: CelebrationStyle
    @State private var confirmationThreshold: String

    public init() {
        _accountBaseXP = State(initialValue: "100")
        _rewardPreset = State(initialValue: .standard)
        _celebrationStyle = State(initialValue: .subtle)
        _confirmationThreshold = State(initialValue: "500")
    }

    public enum RewardPreset: String, CaseIterable, Identifiable {
        case low = "Low"
        case standard = "Standard"
        case generous = "Generous"
        public var id: String { rawValue }
    }

    public enum CelebrationStyle: String, CaseIterable, Identifiable {
        case off = "Off"
        case subtle = "Subtle"
        case full = "Full"
        public var id: String { rawValue }
    }

    public var body: some View {
        Form {
            Section("Progression Configuration") {
                HStack {
                    Text("Account Base XP")
                    Spacer()
                    TextField("Base XP", text: $accountBaseXP)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                }

                Picker("Reward Multiplier", selection: $rewardPreset) {
                    ForEach(RewardPreset.allCases) { p in
                        Text(p.rawValue).tag(p)
                    }
                }
            }

            Section("Experience & Polish") {
                Picker("Celebration Animation", selection: $celebrationStyle) {
                    ForEach(CelebrationStyle.allCases) { c in
                        Text(c.rawValue).tag(c)
                    }
                }
            }

            Section("Shop & Rewards Guard") {
                HStack {
                    Text("Confirm Purchases Above")
                    Spacer()
                    TextField("Coins", text: $confirmationThreshold)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 80)
                    Text("coins")
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                }
            }

            Section("Danger Zone") {
                NavigationLink(destination: GrowthResetView()) {
                    Label("Reset Growth Progression…", systemImage: "arrow.counterclockwise")
                        .foregroundStyle(IOSColor.coral(colorScheme))
                }
            }
        }
        .navigationTitle("Growth Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
            }
        }
    }
}
