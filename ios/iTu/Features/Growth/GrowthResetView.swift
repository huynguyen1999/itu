import SwiftUI
import iTuDomain
import iTuDesignCore

public struct GrowthResetView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dismiss) private var dismiss

    @State private var resetScope: GrowthResetScope = .allXP
    @State private var resetSkillID = ""
    @State private var keepEarningRules = true
    @State private var keepShopRewards = true
    @State private var resetPreview: GrowthResetPreviewDTO?
    @State private var resetLoading = false
    @State private var showingConfirmation = false
    @State private var resetMessage: String?

    public init() {}

    public var body: some View {
        Form {
            Section {
                Text("Growth Reset is available only online and requires a server preview before confirmation. Configuration rules are preserved.")
                    .font(IOSTypography.caption)
                    .foregroundStyle(IOSColor.inkDim(colorScheme))
            }

            Section("Reset Scope") {
                Picker("Scope", selection: $resetScope) {
                    Text("All Skills XP").tag(GrowthResetScope.allXP)
                    Text("Single Skill").tag(GrowthResetScope.skill)
                    Text("Full Reset").tag(GrowthResetScope.full)
                }

                if resetScope == .skill {
                    Picker("Target Skill", selection: $resetSkillID) {
                        Text("Select Skill").tag("")
                        ForEach(model.skills) { skill in
                            Text(skill.name).tag(skill.id)
                        }
                    }
                }

                Toggle("Keep Earning Rules", isOn: $keepEarningRules)
                Toggle("Keep Shop Rewards", isOn: $keepShopRewards)
            }

            Section {
                Button(resetLoading ? "Checking Preview…" : "Preview Reset") {
                    previewReset()
                }
                .disabled(resetLoading || (resetScope == .skill && resetSkillID.isEmpty) || !model.isOnline)
            }

            if let preview = resetPreview {
                Section("Reset Preview") {
                    LabeledContent("Skills Affected", value: "\(preview.affectedSkills.count)")
                    if let coins = preview.coinBalanceToReset {
                        LabeledContent("Coin Balance to Reset", value: "\(coins)")
                    }

                    ForEach(preview.affectedSkills) { affected in
                        HStack {
                            Text(affected.name)
                            Spacer()
                            Text("-\(affected.xpToReset) XP (Lvl \(affected.currentLevel) → \(affected.newLevel))")
                                .font(IOSTypography.captionBold)
                                .foregroundStyle(IOSColor.coral(colorScheme))
                        }
                    }

                    Button("Confirm and Reset Growth", role: .destructive) {
                        showingConfirmation = true
                    }
                }
            }

            if let message = resetMessage {
                Section {
                    Text(message)
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.teal(colorScheme))
                }
            }
        }
        .navigationTitle("Reset Growth")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Reset Growth Progression?", isPresented: $showingConfirmation) {
            Button("Reset Growth", role: .destructive) {
                executeReset()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This action permanently resets your selected progression on the server.")
        }
    }

    private func previewReset() {
        resetLoading = true
        resetMessage = nil
        Task {
            resetPreview = await model.previewGrowthReset(
                scope: resetScope,
                skillID: resetScope == .skill ? resetSkillID : nil
            )
            resetLoading = false
        }
    }

    private func executeReset() {
        resetLoading = true
        Task {
            let ok = await model.executeGrowthReset(
                scope: resetScope,
                skillID: resetScope == .skill ? resetSkillID : nil,
                keepEarningRules: keepEarningRules,
                keepShopRewards: keepShopRewards
            )
            resetLoading = false
            if ok {
                resetMessage = "Growth was reset successfully."
                resetPreview = nil
            } else {
                resetMessage = "Could not complete reset."
            }
        }
    }
}
