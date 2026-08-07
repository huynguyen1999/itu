import SwiftUI

struct GrowthView: View {
    @Environment(AppModel.self) private var model

    @State private var selectedTab: GrowthTab = .attributes
    @State private var editingSkill: SkillNode?
    @State private var editingMappingSkill: SkillNode?
    @State private var shopMode: ShopMode = .shop
    @State private var shopSearch = ""
    @State private var shopCategory = "All"
    @State private var showGrowthSettings = false
    @State private var ledgerFilter: LedgerFilter = .all
    @State private var selectedLedgerTransaction: LedgerTransaction?

    private var attributes: [UserAttribute] {
        model.attributes.filter { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "general" }
    }
    private var skills: [SkillNode] {
        model.skills.filter { $0.archivedAt == nil }
    }
    private var shopItems: [ShopItem] {
        model.shopItems
    }
    private var transactions: [LedgerTransaction] {
        model.transactions
    }
    private var userCoins: Int {
        model.userCoins
    }

    enum GrowthTab: String, CaseIterable, Identifiable {
        case attributes = "Attributes"
        case skills = "Skills"
        case shop = "Rewards"
        case ledger = "Ledger"

        var id: String { rawValue }
        var icon: String {
            switch self {
            case .attributes: "chart.pie.fill"
            case .skills: "brain.head.profile"
            case .shop: "bag.fill"
            case .ledger: "list.bullet.rectangle.fill"
            }
        }
    }

    private enum ShopMode: String, CaseIterable, Identifiable {
        case shop = "Shop"
        case inventory = "Inventory"
        var id: String { rawValue }
    }

    private enum LedgerFilter: String, CaseIterable, Identifiable {
        case all = "All"
        case xp = "XP Only"
        case accountXp = "Account XP"
        case coins = "Coins Only"
        var id: String { rawValue }
    }

    var body: some View {
        HStack(spacing: 0) {
            growthRail
            Rectangle()
                .fill(iTuTheme.border)
                .frame(width: 1)

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                // Header
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        iTuSectionLabel(title: "GROWTH & GAMIFICATION", color: iTuTheme.amber)
                        Text("Growth Engine")
                            .font(.system(size: 24, weight: .bold, design: .rounded))
                            .foregroundStyle(iTuTheme.ink)
                        Text("Earn XP, level up attributes, unlock skills, and redeem rewards.")
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.inkDim)
                    }

                    Spacer()

                    // Coins Display
                    HStack(spacing: 6) {
                        Image(systemName: "circle.circle.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(iTuTheme.gold)
                        Text("\(userCoins) Coins")
                            .font(.system(size: 14, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.ink)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(iTuTheme.goldSoft)
                    .clipShape(Capsule())

                    Button {
                        showGrowthSettings = true
                    } label: {
                        Image(systemName: "gearshape")
                            .font(.system(size: 14, weight: .semibold))
                            .accessibilityLabel("Growth settings")
                    }
                    .buttonStyle(iTuGhostButtonStyle())
                    .pointingHandCursor()
                }

                accountProgressCard

                // Active Sub-tab View
                switch selectedTab {
                case .attributes:
                    attributesTab
                case .skills:
                    skillsTab
                case .shop:
                    shopTab
                case .ledger:
                    ledgerTab
                }
            }
                    .padding(24)
                    .frame(maxWidth: 1080)
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                }
                .background(
                    LinearGradient(
                        colors: [iTuTheme.canvas, iTuTheme.goldSoft.opacity(0.15)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .sheet(isPresented: $showGrowthSettings) {
            GrowthSettingsSheet(profile: model.growthProfile) { accountBaseXp, rewardPreset in
                Task {
                    await model.updateGrowthProfile(accountBaseXp: accountBaseXp, rewardPreset: rewardPreset)
                }
            }
        }
    }

    private var growthRail: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                iTuSectionLabel(title: "GROWTH", color: iTuTheme.amber)
                Text("Progress")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
            }
            .padding(.horizontal, 12)
            .padding(.top, 16)
            .padding(.bottom, 8)

            ForEach(GrowthTab.allCases) { tab in
                GrowthRailButton(title: tab.rawValue, systemImage: tab.icon, isSelected: selectedTab == tab) {
                    selectedTab = tab
                }
            }

            Spacer()

            Button {
                showGrowthSettings = true
            } label: {
                Label("Growth settings", systemImage: "gearshape")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(iTuGhostButtonStyle(height: 34))
            .padding(.horizontal, 4)
            .accessibilityLabel("Growth settings")
        }
        .padding(12)
        .frame(width: 206)
        .frame(maxHeight: .infinity, alignment: .topLeading)
        .background(iTuTheme.surface)
    }

    private var accountProgressValues: (current: Int, required: Int)? {
        if let current = model.growthProgressXp,
           let required = model.growthRequiredXp,
           required > 0 {
            return (max(0, current), required)
        }

        guard let total = model.growthCurrentXp,
              let next = model.growthNextLevelXp,
              let level = model.growthLevel,
              total >= 0,
              next > 0,
              level > 0 else { return nil }
        let levelSquaredResult = level.multipliedReportingOverflow(by: level)
        guard !levelSquaredResult.overflow, levelSquaredResult.partialValue > 0 else { return nil }
        let baseXP = max(1, next / levelSquaredResult.partialValue)
        let previousLevel = level - 1
        let previousLevelSquaredResult = previousLevel.multipliedReportingOverflow(by: previousLevel)
        guard !previousLevelSquaredResult.overflow else { return nil }
        let levelStartResult = baseXP.multipliedReportingOverflow(by: previousLevelSquaredResult.partialValue)
        guard !levelStartResult.overflow, next > levelStartResult.partialValue else { return nil }
        let levelStartXP = levelStartResult.partialValue
        return (total >= levelStartXP ? total - levelStartXP : 0, next - levelStartXP)
    }

    private var accountProgressCard: some View {
        let values = accountProgressValues
        let progress = values.map { min(1, max(0, CGFloat($0.current) / CGFloat($0.required))) } ?? 0
        return HStack(spacing: 16) {
            Image(systemName: "sparkles")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(iTuTheme.amber)
                .frame(width: 40, height: 40)
                .background(iTuTheme.goldSoft)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text("Account XP")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    Spacer()
                    Text(model.growthLevel.map { "Level \($0)" } ?? "Level —")
                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.forest)
                }
                ProgressView(value: progress)
                    .tint(iTuTheme.teal)
                Text(values.map { "\($0.current) / \($0.required) XP to next level" } ?? "Growth profile unavailable")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .iTuPanel(radius: 14)
    }

    private var tabBar: some View {
        HStack(spacing: 8) {
            ForEach(GrowthTab.allCases) { tab in
                Button {
                    selectedTab = tab
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 13, weight: .medium))
                        Text(tab.rawValue)
                            .font(.system(size: 13, weight: selectedTab == tab ? .semibold : .medium))
                    }
                    .foregroundStyle(selectedTab == tab ? iTuTheme.forest : iTuTheme.inkDim)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(selectedTab == tab ? iTuTheme.surface : Color.clear)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay {
                        if selectedTab == tab {
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(iTuTheme.border, lineWidth: 1)
                        }
                    }
                }
                .buttonStyle(.plain)
                .pointingHandCursor()
            }
        }
    }

    // MARK: - Attributes Tab

    private var attributesTab: some View {
        Group {
            if attributes.isEmpty {
                emptyStateView(icon: "chart.pie.fill", title: "No Attributes Yet", subtitle: "Complete tasks and focus sessions to level up your attributes.")
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 14)], spacing: 14) {
                    ForEach(attributes) { attr in
                        AttributeCard(attr: attr)
                    }
                }
            }
        }
    }

    // MARK: - Skills Tab

    private var skillsTab: some View {
        Group {
            if skills.isEmpty {
                emptyStateView(icon: "brain.head.profile", title: "No Skills Available", subtitle: "Unlocked skills will appear here as you gain growth points.")
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 280), spacing: 14)], spacing: 14) {
                    ForEach(skills) { skill in
                        VStack(alignment: .leading, spacing: 14) {
                            HStack(spacing: 12) {
                                Image(systemName: GrowthIconDescriptor.resolve(skill.icon).systemImage)
                                    .font(.system(size: 20, weight: .semibold))
                                    .foregroundStyle(iTuTheme.teal)
                                    .frame(width: 44, height: 44)
                                    .background(iTuTheme.mintTint)
                                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                                VStack(alignment: .leading, spacing: 3) {
                                    HStack(spacing: 8) {
                                        Text(skill.name)
                                            .font(.system(size: 15, weight: .semibold))
                                            .foregroundStyle(iTuTheme.ink)
                                        Text("Lvl \(skill.level)/\(skill.maxLevel)")
                                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                                            .foregroundStyle(iTuTheme.amber)
                                    }
                                }
                                Spacer(minLength: 0)
                            }

                            Text(skill.description)
                                .font(.system(size: 12))
                                .foregroundStyle(iTuTheme.inkDim)
                                .lineLimit(3)

                            HStack(spacing: 8) {
                                Button {
                                    editingSkill = skill
                                } label: {
                                    Text("Edit")
                                        .font(.system(size: 12, weight: .semibold))
                                }
                                .buttonStyle(iTuSecondaryButtonStyle(height: 44))
                                if !attributes.isEmpty {
                                    Button("Map attributes") {
                                        editingMappingSkill = skill
                                    }
                                    .buttonStyle(iTuSecondaryButtonStyle(height: 44))
                                    .accessibilityLabel("Map attributes for \(skill.name)")
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .trailing)
                        }
                        .padding(16)
                        .iTuHoverCard()
                        .iTuPanel(radius: 14)
                    }
                }
            }
        }
        .sheet(item: $editingSkill) { skill in
            SkillEditorSheet(skill: skill) { name, description, icon in
                Task { await model.updateSkill(skill, name: name, description: description, icon: icon) }
            }
        }
        .sheet(item: $editingMappingSkill) { skill in
            GrowthAttributeMappingEditorView(
                skill: skill,
                attributes: model.attributes
                    .filter { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "general" },
                mappings: model.growthAttributeMappings[skill.id] ?? [],
                pendingMutation: model.pendingMutations
                    .filter { $0.kind == "growthattributemapping.upsert" && $0.entityId == skill.id }
                    .sorted { $0.occurredAt == $1.occurredAt ? $0.id > $1.id : $0.occurredAt > $1.occurredAt }
                    .first,
                onSave: { drafts in
                    Task { await model.upsertGrowthAttributeMappings(skillID: skill.id, mappings: drafts) }
                },
                onRetry: { mutation in
                    Task { await model.retryPendingMutation(mutation, keepLocal: true) }
                }
            )
        }
    }

    // MARK: - Shop Tab

    private var shopTab: some View {
        Group {
            shopControls
            if shopMode == .shop {
                shopCategoryRow
            }
            if shopMode == .inventory {
                inventoryTab
            } else {
                shopRewardsTab
            }
        }
    }

    private var shopControls: some View {
        HStack(spacing: 10) {
            Picker("Growth shop", selection: $shopMode) {
                ForEach(ShopMode.allCases) { mode in
                    Text(mode.rawValue).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .frame(width: 190)

            HStack(spacing: 7) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(iTuTheme.inkFaint)
                TextField(shopMode == .shop ? "Search the shop" : "Search inventory", text: $shopSearch)
                    .textFieldStyle(.plain)
            }
            .padding(.horizontal, 10)
            .frame(height: 34)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(iTuTheme.border, lineWidth: 1)
            }
        }
    }

    private var shopCategoryRow: some View {
        let categories = ["All"] + Array(Set(shopItems.map(\.category).filter { !$0.isEmpty })).sorted()
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(categories, id: \.self) { category in
                    Button {
                        shopCategory = category
                    } label: {
                        Text(category)
                            .font(.system(size: 12, weight: shopCategory == category ? .semibold : .medium))
                            .foregroundStyle(shopCategory == category ? iTuTheme.forest : iTuTheme.inkDim)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(shopCategory == category ? iTuTheme.mintTint : Color.clear)
                            .clipShape(Capsule())
                            .overlay {
                                Capsule().stroke(shopCategory == category ? iTuTheme.teal.opacity(0.35) : iTuTheme.border, lineWidth: 1)
                            }
                    }
                    .buttonStyle(.plain)
                    .pointingHandCursor()
                }
            }
        }
    }

    private var shopRewardsTab: some View {
        let query = shopSearch.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let visibleItems = shopItems.filter {
            (shopCategory == "All" || $0.category == shopCategory) &&
                (query.isEmpty || "\($0.title) \($0.description)".lowercased().contains(query))
        }
        return Group {
            if shopItems.isEmpty {
                emptyStateView(icon: "bag.fill", title: "Shop is Empty", subtitle: "Rewards from your account will appear here.")
            } else if visibleItems.isEmpty {
                emptyStateView(icon: "magnifyingglass", title: "No Rewards Found", subtitle: "Try another category or search term.")
            } else {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                    ForEach(visibleItems) { item in
                        VStack(alignment: .leading, spacing: 12) {
                            HStack(spacing: 12) {
                                Image(systemName: GrowthIconDescriptor.resolve(item.icon).systemImage)
                                    .font(.system(size: 20))
                                    .foregroundStyle(iTuTheme.gold)
                                    .frame(width: 40, height: 40)
                                    .background(iTuTheme.goldSoft)
                                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.title)
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(iTuTheme.ink)
                                    Text("\(item.costCoins) Coins")
                                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                                        .foregroundStyle(iTuTheme.gold)
                                }

                                Spacer()
                            }

                            Text(item.description)
                                .font(.system(size: 12))
                                .foregroundStyle(iTuTheme.inkDim)
                                .frame(maxHeight: 36, alignment: .topLeading)

                            if item.isPurchased && !item.repeatable {
                                Button {
                                } label: {
                                    Text("Purchased")
                                        .font(.system(size: 12, weight: .semibold))
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(iTuGhostButtonStyle(height: 32))
                                .disabled(true)
                            } else {
                                Button {
                                    Task { await model.redeemGrowthReward(item) }
                                } label: {
                                    Text("Redeem")
                                        .font(.system(size: 12, weight: .semibold))
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(iTuSecondaryButtonStyle(height: 32))
                                .disabled(userCoins < item.costCoins || (!item.repeatable && item.redemptionCount > 0))
                            }
                        }
                        .padding(16)
                        .iTuHoverCard()
                        .iTuPanel(radius: 14)
                    }
                }
            }
        }
    }

    private var inventoryTab: some View {
        let query = shopSearch.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let visibleItems = model.inventoryItems.filter {
            query.isEmpty || "\($0.title) \($0.description)".lowercased().contains(query)
        }
        return Group {
            if visibleItems.isEmpty {
                emptyStateView(icon: "shippingbox.fill", title: "Your inventory is empty", subtitle: "Buy a reward or earn one from a completed task.")
            } else {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
                    ForEach(visibleItems) { item in
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Image(systemName: GrowthIconDescriptor.resolve(item.icon).systemImage)
                                    .foregroundStyle(iTuTheme.teal)
                                Spacer()
                                Text("\(item.quantity) owned")
                                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                                    .foregroundStyle(iTuTheme.teal)
                            }
                            Text(item.title)
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundStyle(iTuTheme.ink)
                            Text(item.description)
                                .font(.system(size: 12))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                        .padding(16)
                        .iTuHoverCard()
                        .iTuPanel(radius: 14)
                    }
                }
            }
        }
    }

    // MARK: - Ledger Tab

    private var ledgerTab: some View {
        let visibleTransactions = transactions.filter { tx in
            switch ledgerFilter {
            case .all: true
            case .xp: tx.amountXP != 0 || tx.amountAccountXP != 0 || tx.amountSkillXP != 0 || tx.amountAttributeXP != 0 || tx.amountDerivedAttributeXP != 0
            case .accountXp: tx.amountAccountXP != 0
            case .coins: tx.amountCoins != 0
            }
        }

        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Transaction history")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Picker("Ledger filter", selection: $ledgerFilter) {
                    ForEach(LedgerFilter.allCases) { filter in
                        Text(filter.rawValue).tag(filter)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 360)
            }

            if transactions.isEmpty {
                emptyStateView(icon: "list.bullet.rectangle.fill", title: "No Transactions", subtitle: "Your coin and XP rewards log will appear here.")
            } else if visibleTransactions.isEmpty {
                emptyStateView(icon: "line.3.horizontal.decrease.circle", title: "No Matching Entries", subtitle: "Try another ledger filter.")
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(visibleTransactions.enumerated()), id: \.element.id) { index, tx in
                        Button {
                            selectedLedgerTransaction = tx
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: tx.amountCoins != 0 ? "circle.circle.fill" : "sparkles")
                                    .font(.system(size: 14))
                                    .foregroundStyle(tx.amountCoins != 0 ? iTuTheme.gold : iTuTheme.teal)
                                    .frame(width: 24)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(tx.title)
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(iTuTheme.ink)
                                        .lineLimit(1)
                                    Text("\(tx.type) • \(tx.timestamp)")
                                        .font(.system(size: 10))
                                        .foregroundStyle(iTuTheme.inkFaint)
                                        .lineLimit(1)
                                }

                                Spacer(minLength: 8)
                                ledgerAmountChips(tx)
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(iTuTheme.inkFaint)
                            }
                            .padding(.horizontal, 12)
                            .padding(.vertical, 11)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        if index < visibleTransactions.count - 1 {
                            Rectangle()
                                .fill(iTuTheme.borderSoft)
                                .frame(height: 1)
                                .padding(.leading, 48)
                        }
                    }
                }
                .iTuPanel(radius: 14)
            }
        }
        .sheet(item: $selectedLedgerTransaction) { tx in
            LedgerDetailSheet(transaction: tx)
        }
    }

    @ViewBuilder
    private func ledgerAmountChips(_ tx: LedgerTransaction) -> some View {
        let xp = tx.amountAccountXP + tx.amountSkillXP + tx.amountAttributeXP + tx.amountDerivedAttributeXP
        if xp != 0 || (tx.amountXP != 0 && tx.amountAccountXP == 0 && tx.amountSkillXP == 0 && tx.amountAttributeXP == 0 && tx.amountDerivedAttributeXP == 0) {
            Text(amountLabel(xp == 0 ? tx.amountXP : xp, suffix: " XP"))
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.teal)
        }
        if tx.amountCoins != 0 {
            Text(amountLabel(tx.amountCoins, suffix: " Coins"))
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.gold)
        }
    }

    private func emptyStateView(icon: String, title: String, subtitle: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 36))
                .foregroundStyle(iTuTheme.inkDim)
            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
            Text(subtitle)
                .font(.system(size: 13))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
        .iTuPanel(radius: 14)
    }

    private func amountLabel(_ amount: Int, suffix: String) -> String {
        let sign = amount > 0 ? "+" : ""
        return "\(sign)\(amount)\(suffix)"
    }
}

private struct GrowthRailButton: View {
    let title: String
    let systemImage: String
    let isSelected: Bool
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .frame(width: 18)
                Text(title)
                    .font(.system(size: 13, weight: isSelected ? .semibold : .regular))
                Spacer()
            }
            .foregroundStyle(isSelected ? iTuTheme.teal : iTuTheme.inkDim)
            .padding(.horizontal, 10)
            .frame(height: 36)
            .background(isSelected ? iTuTheme.mintTint : (isHovered ? iTuTheme.surfaceMuted : Color.clear))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
        .onHover { isHovered = $0 }
    }
}

private struct LedgerDetailSheet: View {
    @Environment(\.dismiss) private var dismiss
    let transaction: LedgerTransaction

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Ledger record")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.teal)
                    Text(transaction.title)
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                    Text("\(transaction.type) • \(transaction.timestamp)")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(iTuGhostButtonStyle())
            }

            VStack(alignment: .leading, spacing: 10) {
                ledgerDetailRow("Account XP", amount: transaction.amountAccountXP, color: iTuTheme.teal)
                ledgerDetailRow("Skill XP", amount: transaction.amountSkillXP, color: iTuTheme.forest)
                ledgerDetailRow("Attribute XP", amount: transaction.amountAttributeXP, color: iTuTheme.teal)
                ledgerDetailRow("Derived Attribute XP", amount: transaction.amountDerivedAttributeXP, color: iTuTheme.amber)
                if transaction.amountAccountXP == 0 && transaction.amountSkillXP == 0 && transaction.amountAttributeXP == 0 && transaction.amountDerivedAttributeXP == 0 {
                    ledgerDetailRow("XP", amount: transaction.amountXP, color: iTuTheme.teal)
                }
                ledgerDetailRow("Coins", amount: transaction.amountCoins, color: iTuTheme.gold)
            }
            .padding(14)
            .iTuPanel(radius: 12)
        }
        .padding(24)
        .frame(width: 440)
    }

    @ViewBuilder
    private func ledgerDetailRow(_ label: String, amount: Int, color: Color) -> some View {
        if amount != 0 {
            HStack {
                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(iTuTheme.inkDim)
                Spacer()
                Text("\(amount > 0 ? "+" : "")\(amount)")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundStyle(amount < 0 ? iTuTheme.coral : color)
            }
        }
    }
}

private struct GrowthSettingsSheet: View {
    @Environment(\.dismiss) private var dismiss

    let profile: GrowthProfileDTO?
    let onSave: (Int, GrowthRewardPreset) -> Void

    @State private var accountBaseXp: Int
    @State private var rewardPreset: GrowthRewardPreset

    init(profile: GrowthProfileDTO?, onSave: @escaping (Int, GrowthRewardPreset) -> Void) {
        self.profile = profile
        self.onSave = onSave
        _accountBaseXp = State(initialValue: profile?.accountBaseXp ?? 100)
        _rewardPreset = State(initialValue: profile?.rewardPreset ?? .standard)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Growth Settings")
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                    Text("Configure the XP curve used by your growth engine.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(iTuGhostButtonStyle())
            }

            if profile == nil {
                Label("Growth profile is unavailable while offline.", systemImage: "wifi.slash")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            VStack(alignment: .leading, spacing: 7) {
                Text("Account base XP")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                TextField("10–10,000", value: $accountBaseXp, format: .number)
                    .textFieldStyle(.roundedBorder)
                Text("Higher values make each level require more XP.")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkFaint)
            }

            VStack(alignment: .leading, spacing: 7) {
                Text("Reward preset")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                Picker("Reward preset", selection: $rewardPreset) {
                    ForEach(GrowthRewardPreset.allCases) { preset in
                        Text(preset.title).tag(preset)
                    }
                }
                .pickerStyle(.segmented)
                Text("Controls how generous XP and coin rewards are.")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkFaint)
            }

            Spacer()

            Button("Save Settings") {
                onSave(accountBaseXp, rewardPreset)
                dismiss()
            }
            .buttonStyle(iTuPrimaryButtonStyle())
            .disabled(profile == nil || !(10...10_000).contains(accountBaseXp))
        }
        .padding(24)
        .frame(width: 440, height: 360)
    }
}

private struct SkillEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let skill: SkillNode
    let onSave: (String, String, String) -> Void

    @State private var name: String
    @State private var description: String
    @State private var icon: String

    init(skill: SkillNode, onSave: @escaping (String, String, String) -> Void) {
        self.skill = skill
        self.onSave = onSave
        _name = State(initialValue: skill.name)
        _description = State(initialValue: skill.description)
        _icon = State(initialValue: skill.icon)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Edit Skill")
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                    Text("Level and XP are earned from activity.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(iTuGhostButtonStyle())
            }

            TextField("Skill name", text: $name)
                .textFieldStyle(.roundedBorder)
            TextField("Description", text: $description)
                .textFieldStyle(.roundedBorder)
            TextField("SF Symbol", text: $icon)
                .textFieldStyle(.roundedBorder)

            Spacer()

            Button("Save Skill") {
                onSave(name, description, icon)
                dismiss()
            }
            .buttonStyle(iTuPrimaryButtonStyle())
            .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(24)
        .frame(width: 420, height: 280)
    }
}

private struct AttributeCard: View {
    let attr: UserAttribute

    private var progressXP: Int {
        if let progressXP = attr.progressXP { return progressXP }
        return max(0, attr.currentXP - levelStartXP)
    }

    private var requiredXP: Int {
        if let requiredXP = attr.requiredXP { return requiredXP }
        return max(1, attr.nextLevelXP - levelStartXP)
    }

    private var levelStartXP: Int {
        let levelSquared = max(1, attr.level * attr.level)
        let baseXP = max(1, attr.nextLevelXP / levelSquared)
        return baseXP * (attr.level - 1) * (attr.level - 1)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: GrowthIconDescriptor.resolve(attr.icon).systemImage)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(iTuTheme.teal)

                Text(attr.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)

                Spacer()

                Text("Level \(attr.level)")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.teal)
            }

            // Progress bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(iTuTheme.borderSoft)
                        .frame(height: 8)

                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [iTuTheme.mint, iTuTheme.teal],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * CGFloat(progressXP) / CGFloat(max(1, requiredXP)), height: 8)
                }
            }
            .frame(height: 8)

            HStack {
                Text("\(progressXP) / \(requiredXP) XP")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
                Spacer()
                Text("\(max(0, requiredXP - progressXP)) XP to Lvl \(attr.level + 1)")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
            }
        }
        .padding(16)
        .iTuHoverCard()
        .iTuPanel(radius: 14)
    }
}
