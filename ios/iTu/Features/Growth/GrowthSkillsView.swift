import SwiftUI
import iTuDomain
import iTuDesignCore

public struct GrowthSkillDetailView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme

    let skill: SkillNode
    @State private var showingEditSheet = false
    @State private var showingMappingSheet = false

    public init(skill: SkillNode) {
        self.skill = skill
    }

    private var liveSkill: SkillNode {
        model.skills.first(where: { $0.id == skill.id }) ?? skill
    }

    private var mappings: [GrowthAttributeMappingDTO] {
        model.phase6State.growthAttributeMappings[liveSkill.id] ?? []
    }

    private var relatedTransactions: [LedgerTransaction] {
        model.transactions.filter { tx in
            tx.title.localizedCaseInsensitiveContains(liveSkill.name)
        }
    }

    private var progressValue: Double {
        let current = liveSkill.currentXP ?? 0
        let next = max(1, liveSkill.nextLevelXP ?? 100)
        return min(1, max(0, Double(current) / Double(next)))
    }

    public var body: some View {
        IOSPage {
            // Header Card
            IOSHeroCard {
                VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                    HStack {
                        Image(systemName: GrowthIconDescriptor.resolve(liveSkill.icon).systemImage)
                            .font(.title.weight(.bold))
                            .foregroundStyle(IOSColor.mint(colorScheme))
                            .frame(width: 52, height: 52)
                            .background(Color.white.opacity(0.15), in: Circle())
                        Spacer()
                        Text("LEVEL \(liveSkill.level)")
                            .font(IOSTypography.metric)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 6)
                            .background(Color.white.opacity(0.2), in: Capsule())
                    }

                    Text(liveSkill.name)
                        .font(IOSTypography.largeTitle)
                        .foregroundStyle(.white)

                    if !liveSkill.description.isEmpty {
                        Text(liveSkill.description)
                            .font(IOSTypography.subheadline)
                            .foregroundStyle(.white.opacity(0.85))
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        ProgressView(value: progressValue)
                            .tint(IOSColor.mint(colorScheme))
                        HStack {
                            Text("\(liveSkill.currentXP ?? 0) / \(liveSkill.nextLevelXP ?? 100) XP")
                                .font(IOSTypography.captionBold)
                            Spacer()
                            Text("\(max(0, (liveSkill.nextLevelXP ?? 100) - (liveSkill.currentXP ?? 0))) XP to Level \(liveSkill.level + 1)")
                                .font(IOSTypography.caption)
                                .foregroundStyle(.white.opacity(0.8))
                        }
                    }
                    .padding(.top, 4)
                }
            }

            // Quick Actions: Edit & Map
            HStack(spacing: IOSSpacing.compact) {
                Button {
                    showingEditSheet = true
                } label: {
                    HStack {
                        Image(systemName: "pencil")
                        Text("Edit Skill")
                    }
                    .font(IOSTypography.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(IOSColor.surface(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous).stroke(IOSColor.border(colorScheme), lineWidth: 1))
                    .foregroundStyle(IOSColor.ink(colorScheme))
                }
                .buttonStyle(.plain)

                Button {
                    showingMappingSheet = true
                } label: {
                    HStack {
                        Image(systemName: "arrow.triangle.branch")
                        Text("Map Attributes")
                    }
                    .font(IOSTypography.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(IOSColor.teal(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous))
                    .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
            }

            // Mapped Attributes Section
            IOSSection(title: "Mapped Attributes", subtitle: "\(mappings.count) active") {
                if mappings.isEmpty {
                    IOSEmptyState(
                        icon: "arrow.triangle.branch",
                        title: "No Attributes Mapped",
                        description: "Map this skill to route its XP into attributes like Knowledge or Discipline."
                    ) {
                        Button("Map Attributes") { showingMappingSheet = true }
                            .font(IOSTypography.captionBold)
                            .buttonStyle(.borderedProminent)
                            .tint(IOSColor.teal(colorScheme))
                    }
                } else {
                    VStack(spacing: IOSSpacing.tight) {
                        ForEach(mappings, id: \.attributeId) { mapping in
                            let attr = model.attributes.first(where: { $0.id == mapping.attributeId })
                            HStack(spacing: IOSSpacing.compact) {
                                Image(systemName: GrowthIconDescriptor.resolve(attr?.icon).systemImage)
                                    .font(.headline)
                                    .foregroundStyle(IOSColor.teal(colorScheme))
                                    .frame(width: 36, height: 36)
                                    .background(IOSColor.mintTint(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(attr?.name ?? mapping.attributeId)
                                        .font(IOSTypography.headline)
                                        .foregroundStyle(IOSColor.ink(colorScheme))
                                    Text(mapping.slot == .primary ? "Primary Routing" : "Secondary Routing")
                                        .font(IOSTypography.caption)
                                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                                }

                                Spacer()

                                Text("\(mapping.weight)%")
                                    .font(IOSTypography.metric)
                                    .foregroundStyle(IOSColor.teal(colorScheme))
                            }
                            .padding(IOSSpacing.normal)
                            .background(IOSColor.surface(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous).stroke(IOSColor.borderSoft(colorScheme), lineWidth: 1))
                        }
                    }
                }
            }

            // Recent XP Activity Section
            IOSSection(title: "Recent Skill Activity", subtitle: "\(relatedTransactions.count) transactions") {
                if relatedTransactions.isEmpty {
                    IOSEmptyState(
                        icon: "sparkles",
                        title: "No Skill Activity",
                        description: "Earn Skill XP by working on tasks and routines."
                    )
                } else {
                    VStack(spacing: IOSSpacing.tight) {
                        ForEach(relatedTransactions.prefix(6)) { tx in
                            NavigationLink(destination: GrowthLedgerDetailView(transaction: tx)) {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(tx.title)
                                            .font(IOSTypography.subheadline)
                                            .fontWeight(.medium)
                                            .foregroundStyle(IOSColor.ink(colorScheme))
                                        Text(tx.timestamp)
                                            .font(IOSTypography.caption)
                                            .foregroundStyle(IOSColor.inkFaint(colorScheme))
                                    }
                                    Spacer()
                                    if tx.amountXP != 0 {
                                        Text("+\(tx.amountXP) XP")
                                            .font(IOSTypography.captionBold)
                                            .foregroundStyle(IOSColor.teal(colorScheme))
                                    }
                                }
                                .padding(IOSSpacing.normal)
                                .background(IOSColor.surface(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous).stroke(IOSColor.borderSoft(colorScheme), lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .navigationTitle(liveSkill.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingEditSheet) {
            GrowthSkillEditorView(skill: liveSkill) { name, desc, icon in
                Task {
                    await model.updateGrowthSkill(id: liveSkill.id, name: name, description: desc, icon: icon)
                }
            }
        }
        .sheet(isPresented: $showingMappingSheet) {
            GrowthAttributeMappingEditorView(
                skill: liveSkill,
                attributes: model.attributes,
                mappings: mappings
            ) { drafts in
                Task {
                    await model.upsertGrowthAttributeMappings(skillID: liveSkill.id, mappings: drafts)
                }
            }
        }
    }
}

public struct GrowthSkillsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    private var skills: [SkillNode] {
        model.skills.filter { $0.archivedAt == nil }
    }

    public var body: some View {
        if skills.isEmpty {
            IOSEmptyState(
                icon: "brain.head.profile",
                title: "No Skills Cached",
                description: "Skills earn focused progression from eligible activities."
            )
        } else {
            VStack(spacing: IOSSpacing.compact) {
                ForEach(skills) { skill in
                    NavigationLink(destination: GrowthSkillDetailView(skill: skill)) {
                        skillCard(skill)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func skillCard(_ skill: SkillNode) -> some View {
        let current = skill.currentXP ?? 0
        let next = max(1, skill.nextLevelXP ?? 100)
        let progress = min(1, max(0, Double(current) / Double(next)))
        let mappingCount = model.phase6State.growthAttributeMappings[skill.id]?.count ?? 0

        return IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                HStack(spacing: IOSSpacing.compact) {
                    Image(systemName: GrowthIconDescriptor.resolve(skill.icon).systemImage)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(IOSColor.teal(colorScheme))
                        .frame(width: 40, height: 40)
                        .background(IOSColor.mintTint(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(skill.name)
                            .font(IOSTypography.headline)
                            .foregroundStyle(IOSColor.ink(colorScheme))
                        Text("Level \(skill.level)")
                            .font(IOSTypography.captionBold)
                            .foregroundStyle(IOSColor.teal(colorScheme))
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(IOSColor.inkFaint(colorScheme))
                }

                if !skill.description.isEmpty {
                    Text(skill.description)
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                        .lineLimit(2)
                }

                VStack(alignment: .leading, spacing: 4) {
                    ProgressView(value: progress)
                        .tint(IOSColor.teal(colorScheme))
                    HStack {
                        Text("\(current) / \(next) XP")
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.inkDim(colorScheme))
                        Spacer()
                        Text(mappingCount > 0 ? "\(mappingCount) mapped attributes" : "Unmapped")
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.inkFaint(colorScheme))
                    }
                }
            }
        }
    }
}
