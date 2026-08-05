import SwiftUI

struct GrowthEarningRuleEditorView: View {
    @Environment(AppModel.self) private var model
    let taskID: String

    @State private var isEditing = false
    @State private var searchText = ""
    @State private var coinReward = 0
    @State private var accountXp = 100
    @State private var skillAwards: [String: Int] = [:]
    @State private var itemAwards: [String: Int] = [:]
    @FocusState private var searchFocused: Bool

    private struct Entry: Identifiable {
        let id: String
        let name: String
        let icon: String
        let kind: Kind

        enum Kind: String {
            case attribute = "ATTRIBUTE"
            case skill = "SKILL"

            var title: String { self == .attribute ? "Attributes" : "Skills" }
            var iconColor: Color { self == .attribute ? iTuTheme.amber : iTuTheme.teal }
        }
    }

    private var rule: GrowthEarningRuleDTO? { model.growthEarningRules[taskID] }

    private var entries: [Entry] {
        let attributes = model.attributes.map {
            Entry(id: $0.id, name: $0.name, icon: $0.icon, kind: .attribute)
        }
        let skills = model.skills.map {
            Entry(id: $0.id, name: $0.name, icon: $0.icon, kind: .skill)
        }
        var combined = attributes
        combined.append(contentsOf: skills)
        return combined.sorted {
            if $0.kind != $1.kind { return $0.kind.rawValue < $1.kind.rawValue }
            return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    private var filteredEntries: [Entry] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return entries }
        return entries.filter { $0.name.localizedCaseInsensitiveContains(query) }
    }

    private var selectedEntries: [Entry] {
        entries.filter { (skillAwards[$0.id] ?? 0) > 0 }
    }

    private var totalWeight: Int {
        selectedEntries.reduce(0) { $0 + (skillAwards[$1.id] ?? 0) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            editorHeader

            if isEditing {
                editorBody
                editorFooter
            } else {
                collapsedSummary
            }
        }
        .foregroundStyle(iTuTheme.ink)
        .background(
            LinearGradient(
                colors: [Color(hex: 0x7C3AED, opacity: 0.035), iTuTheme.mintTint],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color(hex: 0x7C3AED, opacity: 0.28), lineWidth: 1)
        }
        .onAppear { hydrate(from: rule) }
        .onChange(of: rule) { _, updated in
            if !isEditing { hydrate(from: updated) }
        }
        .onChange(of: isEditing) { _, editing in
            if editing { searchFocused = true }
        }
    }

    private var editorHeader: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "gift.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color(hex: 0x7C3AED))

            VStack(alignment: .leading, spacing: 2) {
                Text(isEditing ? "Edit Growth rewards" : "Growth rewards")
                    .font(.system(size: 12, weight: .bold))
                    .textCase(.uppercase)
                    .tracking(1.4)
                    .foregroundStyle(isEditing ? iTuTheme.ink : Color(hex: 0x7C3AED))
                if isEditing {
                    Text("Choose what improves when this task is completed.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    Text(hasRewards ? "Rewards on completion" : "No Growth rewards")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                }
            }

            Spacer()

            if isEditing {
                Button {
                    isEditing = false
                    searchText = ""
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(iTuTheme.inkDim)
                        .frame(width: 24, height: 24)
                        .background(iTuTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close Growth rewards editor")
            } else {
                Button("Edit") {
                    hydrate(from: rule)
                    isEditing = true
                }
                .buttonStyle(iTuSecondaryButtonStyle(height: 28))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) {
            if isEditing { Rectangle().fill(iTuTheme.border).frame(height: 1) }
        }
    }

    private var collapsedSummary: some View {
        VStack(alignment: .leading, spacing: 8) {
            if hasRewards {
                GrowthRewardSummaryView(
                    rule: rule,
                    compact: true,
                    archivedSkillIDs: Set(model.skills.filter { $0.archivedAt != nil }.map { $0.id })
                )
            } else {
                Text("Choose XP, coins, or items to award when this task is completed.")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
            }
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 14)
    }

    private var editorBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(iTuTheme.inkFaint)
                TextField("Search attributes and skills", text: $searchText)
                    .textFieldStyle(.plain)
                    .focused($searchFocused)
                    .accessibilityLabel("Search attributes and skills")
            }
            .padding(.horizontal, 10)
            .frame(height: 34)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .stroke(iTuTheme.teal, lineWidth: 1.5)
            }

            HStack(spacing: 10) {
                Image(systemName: "bolt.fill")
                    .foregroundStyle(iTuTheme.teal)
                Text("Account XP budget")
                    .font(.system(size: 12, weight: .semibold))
                Spacer()
                TextField("XP", value: $accountXp, format: .number)
                    .textFieldStyle(.roundedBorder)
                    .multilineTextAlignment(.center)
                    .frame(width: 70)
                    .accessibilityLabel("Account XP budget")
                Text("Weights: \(totalWeight)/100")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(totalWeight == 100 || selectedEntries.isEmpty ? iTuTheme.inkDim : iTuTheme.coral)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .background(iTuTheme.surface.opacity(0.7))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(iTuTheme.border, lineWidth: 1)
            }

            ForEach([Entry.Kind.attribute, Entry.Kind.skill], id: \.rawValue) { kind in
                let group = filteredEntries.filter { $0.kind == kind }
                if !group.isEmpty || searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    entryGroup(kind: kind, entries: group)
                }
            }

            if filteredEntries.isEmpty {
                VStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 22))
                        .foregroundStyle(iTuTheme.inkFaint)
                    Text("No matching attributes or skills.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 18)
            }

            if !selectedEntries.isEmpty && totalWeight != 100 {
                Text("Skill weights must total 100% before saving.")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(iTuTheme.coral)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(iTuTheme.coralTint)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }

            HStack(spacing: 10) {
                Image(systemName: "circle.hexagongrid.fill")
                    .foregroundStyle(iTuTheme.amber)
                Text("Coins")
                    .font(.system(size: 12, weight: .semibold))
                Spacer()
                TextField("0", value: $coinReward, format: .number)
                    .textFieldStyle(.roundedBorder)
                    .multilineTextAlignment(.center)
                    .frame(width: 70)
                    .accessibilityLabel("Coin reward")
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .background(iTuTheme.surface.opacity(0.7))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(iTuTheme.border, lineWidth: 1)
            }

            itemRewards
        }
        .padding(14)
    }

    private func entryGroup(kind: Entry.Kind, entries: [Entry]) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text(kind.title)
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .tracking(1.3)
                    .foregroundStyle(iTuTheme.inkDim)
                Spacer()
                Text("\(entries.filter { (skillAwards[$0.id] ?? 0) > 0 }.count)/3 selected")
                    .font(.system(size: 10))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                ForEach(entries) { entry in
                    entryCard(entry)
                }
            }
        }
    }

    private func entryCard(_ entry: Entry) -> some View {
        let selected = (skillAwards[entry.id] ?? 0) > 0
        let canSelect = selected || selectedEntries.count < 3

        return HStack(spacing: 7) {
            Button {
                toggleEntry(entry)
            } label: {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 16))
                    .foregroundStyle(selected ? Color(hex: 0x8B5CF6) : iTuTheme.inkFaint)
            }
            .buttonStyle(.plain)
            .disabled(!canSelect)
            .accessibilityLabel(selected ? "Remove \(entry.name)" : "Select \(entry.name)")

            GrowthIconView(icon: entry.icon, size: 16, color: entry.kind.iconColor)
                .frame(width: 26, height: 26)
                .background(iTuTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))

            Text(entry.name)
                .font(.system(size: 11, weight: .semibold))
                .lineLimit(1)
                .truncationMode(.tail)

            Spacer(minLength: 2)

            if selected {
                TextField("%", value: weightBinding(for: entry.id), format: .number)
                    .textFieldStyle(.roundedBorder)
                    .multilineTextAlignment(.center)
                    .frame(width: 42)
                    .font(.system(size: 10, design: .monospaced))
                    .accessibilityLabel("\(entry.name) skill weight")
                Text("%")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .frame(minHeight: 48)
        .background(selected ? Color(hex: 0x8B5CF6, opacity: 0.08) : iTuTheme.surface.opacity(0.7))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(selected ? Color(hex: 0x8B5CF6, opacity: 0.65) : iTuTheme.border, lineWidth: 1)
        }
        .opacity(canSelect ? 1 : 0.55)
    }

    @ViewBuilder
    private var itemRewards: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 7) {
                Image(systemName: "gift.fill")
                    .foregroundStyle(Color(hex: 0x7C3AED))
                Text("Item rewards")
                    .font(.system(size: 12, weight: .bold))
            }

            if model.shopItems.isEmpty {
                Text("Create an item in Growth before attaching it to a task.")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
            } else {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(model.shopItems) { item in
                        let selected = (itemAwards[item.id] ?? 0) > 0
                        HStack(spacing: 7) {
                            Button {
                                if selected { itemAwards.removeValue(forKey: item.id) }
                                else { itemAwards[item.id] = 1 }
                            } label: {
                                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 15))
                                    .foregroundStyle(selected ? Color(hex: 0x8B5CF6) : iTuTheme.inkFaint)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(selected ? "Remove \(item.title) reward" : "Select \(item.title) reward")

                            GrowthIconView(icon: item.icon, size: 15, color: Color(hex: 0x7C3AED))
                            Text(item.title)
                                .font(.system(size: 11, weight: .semibold))
                                .lineLimit(1)
                            Spacer(minLength: 2)
                            if selected {
                                TextField("×", value: itemQuantityBinding(for: item.id), format: .number)
                                    .textFieldStyle(.roundedBorder)
                                    .multilineTextAlignment(.center)
                                    .frame(width: 40)
                                    .accessibilityLabel("\(item.title) quantity")
                            }
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 7)
                        .background(selected ? Color(hex: 0x8B5CF6, opacity: 0.08) : iTuTheme.surface.opacity(0.7))
                        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 9, style: .continuous)
                                .stroke(selected ? Color(hex: 0x8B5CF6, opacity: 0.65) : iTuTheme.border, lineWidth: 1)
                        }
                    }
                }
            }
        }
    }

    private var editorFooter: some View {
        HStack(spacing: 8) {
            Text("\(selectedEntries.count) selected · \(accountXp) Account XP · \(totalWeight)% weights")
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundStyle(iTuTheme.inkDim)
                .lineLimit(1)

            Spacer()

            Button("Cancel") {
                hydrate(from: rule)
                isEditing = false
                searchText = ""
            }
            .buttonStyle(iTuGhostButtonStyle(height: 28))

            Button("Save rewards") {
                isEditing = false
                searchText = ""
                Task {
                    await model.upsertTaskGrowthRule(
                        taskID: taskID,
                        coinReward: max(0, coinReward),
                        accountXp: max(0, accountXp),
                        skillAwards: skillAwards.filter { $0.value > 0 },
                        itemAwards: itemAwards.filter { $0.value > 0 }
                    )
                }
            }
            .buttonStyle(iTuPrimaryButtonStyle(height: 28))
            .disabled(!weightsAreValid)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(iTuTheme.surface.opacity(0.8))
        .overlay(alignment: .top) {
            Rectangle().fill(iTuTheme.border).frame(height: 1)
        }
    }

    private func toggleEntry(_ entry: Entry) {
        if (skillAwards[entry.id] ?? 0) > 0 {
            skillAwards.removeValue(forKey: entry.id)
            return
        }

        guard selectedEntries.count < 3 else { return }
        let selectedIDs = selectedEntries.map(\.id)
        let nextWeights: [Int] = switch selectedIDs.count + 1 {
        case 1: [100]
        case 2: [70, 30]
        default: [60, 25, 15]
        }
        var updated = skillAwards.filter { $0.value > 0 }
        for (index, id) in selectedIDs.enumerated() { updated[id] = nextWeights[index] }
        updated[entry.id] = nextWeights[selectedIDs.count]
        skillAwards = updated
    }

    private func weightBinding(for id: String) -> Binding<Int> {
        Binding(
            get: { skillAwards[id] ?? 0 },
            set: { value in
                guard value > 0 else {
                    skillAwards.removeValue(forKey: id)
                    return
                }
                let otherTotal = skillAwards
                    .filter { $0.key != id }
                    .reduce(0) { $0 + max(0, $1.value) }
                skillAwards[id] = min(value, max(1, 100 - otherTotal))
            }
        )
    }

    private func itemQuantityBinding(for id: String) -> Binding<Int> {
        Binding(
            get: { itemAwards[id] ?? 1 },
            set: { itemAwards[id] = max(1, $0) }
        )
    }

    private func hydrate(from rule: GrowthEarningRuleDTO?) {
        coinReward = rule?.coinReward ?? 0
        accountXp = rule?.accountXp ?? 100
        skillAwards = Dictionary(uniqueKeysWithValues: (rule?.skillAwards ?? []).map { ($0.skillId, $0.xpReward) })
        itemAwards = Dictionary(uniqueKeysWithValues: (rule?.itemAwards ?? []).map { ($0.itemId, $0.quantity) })
    }

    private var hasRewards: Bool {
        (rule?.accountXp ?? 0) > 0
            || (rule?.coinReward ?? 0) > 0
            || !(rule?.skillAwards.isEmpty ?? true)
            || !(rule?.itemAwards.isEmpty ?? true)
    }

    private var weightsAreValid: Bool {
        selectedEntries.count <= 3 && (selectedEntries.isEmpty || totalWeight == 100)
    }
}
