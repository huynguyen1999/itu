import SwiftUI
import iTuDomain

struct Phase6GrowthView: View {
    @EnvironmentObject private var model: AppModel
    @State private var pendingRedemption: ShopItem?
    @State private var resetScope: GrowthResetScope = .allXP
    @State private var resetSkillID = ""
    @State private var resetPreview: GrowthResetPreviewDTO?
    @State private var resetLoading = false
    @State private var resetConfirmation = false
    @State private var resetMessage: String?
    @State private var keepEarningRules = true
    @State private var keepShopRewards = true

    var body: some View {
        List {
            SyncBanner()
            Section("Account") {
                LabeledContent("Level", value: model.growthLevel.map(String.init) ?? "Not loaded")
                LabeledContent("Account XP", value: model.growthCurrentXp.map(String.init) ?? "Not loaded")
                LabeledContent("Coins", value: String(model.userCoins))
                if model.growthLevel == nil && model.growthProfile == nil {
                    Text("Growth is waiting for its first online overview. Cached rewards remain available when present.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Attributes") {
                if model.attributes.isEmpty {
                    Text("No Attributes cached.").foregroundStyle(.secondary)
                } else {
                    ForEach(model.attributes) { attribute in
                        GrowthProgressRow(title: attribute.name, level: attribute.level, current: attribute.currentXP, next: attribute.nextLevelXP, icon: attribute.icon)
                    }
                }
            }

            Section("Skills") {
                if model.skills.isEmpty {
                    Text("No Skills cached.").foregroundStyle(.secondary)
                } else {
                    ForEach(model.skills) { skill in
                        GrowthProgressRow(title: skill.name, level: skill.level, current: skill.currentXP ?? 0, next: skill.nextLevelXP ?? 0, icon: skill.icon)
                    }
                }
            }

            Section("Shop") {
                if model.shopItems.isEmpty {
                    Text("No Shop rewards are cached yet. Connect to load them.").foregroundStyle(.secondary)
                } else {
                    ForEach(model.shopItems) { item in
                        HStack {
                            Label(item.title, systemImage: item.icon)
                            Spacer()
                            Text("\(item.costCoins) coins")
                                .font(.caption)
                            Button("Redeem") { pendingRedemption = item }
                                .buttonStyle(.bordered)
                                .disabled(model.userCoins < item.costCoins || (!item.repeatable && item.isPurchased))
                        }
                    }
                }
            }

            Section("Inventory") {
                if model.inventoryItems.isEmpty {
                    Text("Your Inventory is empty.").foregroundStyle(.secondary)
                } else {
                    ForEach(model.inventoryItems) { item in
                        Label("\(item.title) ×\(item.quantity)", systemImage: item.icon)
                    }
                }
            }

            Section("Growth Ledger") {
                if model.transactions.isEmpty {
                    Text("No Growth Ledger Entries cached.").foregroundStyle(.secondary)
                } else {
                    ForEach(model.transactions.prefix(20)) { entry in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(entry.title)
                                Text(entry.timestamp).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if entry.amountXP != 0 { Text("\(entry.amountXP) XP") }
                            if entry.amountCoins != 0 { Text("\(entry.amountCoins) coins") }
                        }
                    }
                }
            }

            Section("Growth Reset") {
                Text("Reset is available only online and requires a server preview plus explicit confirmation.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Picker("Scope", selection: $resetScope) {
                    ForEach(GrowthResetScope.allCases) { scope in
                        Text(scope.title).tag(scope)
                    }
                }
                if resetScope == .skill {
                    if model.skills.isEmpty {
                        Text("No skills are cached for a single-skill reset.")
                            .foregroundStyle(.secondary)
                    } else {
                        Picker("Skill", selection: $resetSkillID) {
                            ForEach(model.skills) { skill in
                                Text(skill.name).tag(skill.id)
                            }
                        }
                    }
                }
                Toggle("Keep earning rules", isOn: $keepEarningRules)
                Toggle("Keep Shop rewards", isOn: $keepShopRewards)
                if let resetMessage {
                    Text(resetMessage)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Button(resetLoading ? "Checking…" : "Preview reset") { previewReset() }
                    .disabled(resetLoading || !model.isOnline || (resetScope == .skill && resetSkillID.isEmpty))
                if let resetPreview {
                    GrowthResetPreviewView(preview: resetPreview)
                    Button("Review and reset", role: .destructive) { resetConfirmation = true }
                        .disabled(resetLoading)
                }
            }
        }
        .navigationTitle("Growth")
        .task {
            if resetSkillID.isEmpty { resetSkillID = model.skills.first?.id ?? "" }
        }
        .onChange(of: resetScope) { _ in resetPreview = nil }
        .confirmationDialog(
            "Reset Growth?",
            isPresented: $resetConfirmation,
            titleVisibility: .visible
        ) {
            Button("Reset \(resetScope.title)", role: .destructive) { executeReset() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(resetConfirmationMessage)
        }
        .confirmationDialog(
            "Redeem this Shop Item?",
            isPresented: Binding(
                get: { pendingRedemption != nil },
                set: { if !$0 { pendingRedemption = nil } }
            )
        ) {
            if let item = pendingRedemption {
                Button("Redeem \(item.title)") { Task { _ = await model.redeemGrowthReward(item) } }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            if let item = pendingRedemption {
                Text("Spend \(item.costCoins) Coins? This redemption is recorded offline and synchronized later.")
            }
        }
    }

    private var selectedSkillID: String? {
        resetScope == .skill ? (resetSkillID.isEmpty ? nil : resetSkillID) : nil
    }

    private var resetConfirmationMessage: String {
        guard let resetPreview else { return "This action cannot be undone." }
        let skillCount = resetPreview.affectedSkills.count
        let coins = resetPreview.coinBalanceToReset.map { " and \($0) coins" } ?? ""
        return "This will reset \(skillCount) skill\(skillCount == 1 ? "" : "s")\(coins)."
    }

    private func previewReset() {
        resetLoading = true
        resetMessage = nil
        Task {
            resetPreview = await model.previewGrowthReset(scope: resetScope, skillID: selectedSkillID)
            if resetPreview == nil { resetMessage = "The reset preview could not be loaded." }
            resetLoading = false
        }
    }

    private func executeReset() {
        resetLoading = true
        resetMessage = nil
        Task {
            let completed = await model.executeGrowthReset(
                scope: resetScope,
                skillID: selectedSkillID,
                keepEarningRules: keepEarningRules,
                keepShopRewards: keepShopRewards
            )
            if completed {
                resetPreview = nil
                resetMessage = "Growth reset completed."
            } else {
                resetMessage = "Growth reset could not be completed."
            }
            resetLoading = false
        }
    }
}

private struct GrowthResetPreviewView: View {
    let preview: GrowthResetPreviewDTO

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Preview").font(.headline)
            ForEach(preview.affectedSkills) { skill in
                LabeledContent(skill.name, value: "Level \(skill.currentLevel) → 1")
            }
            if let coins = preview.coinBalanceToReset {
                LabeledContent("Coins reset", value: String(coins))
            }
        }
    }
}

private struct GrowthProgressRow: View {
    let title: String
    let level: Int
    let current: Int
    let next: Int
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: icon)
            HStack {
                Text("Level \(level)")
                Spacer()
                Text("\(current)/\(max(next, 1)) XP")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ProgressView(value: min(1, max(0, Double(current) / Double(max(next, 1)))))
        }
        .accessibilityElement(children: .combine)
        .accessibilityValue("Level \(level), \(current) of \(max(next, 1)) XP")
    }
}
