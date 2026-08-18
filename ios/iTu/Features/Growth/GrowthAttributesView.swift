import SwiftUI
import iTuDomain
import iTuDesignCore

public struct GrowthAttributeDetailView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    let attribute: UserAttribute

    public init(attribute: UserAttribute) {
        self.attribute = attribute
    }

    private var liveAttribute: UserAttribute {
        model.attributes.first(where: { $0.id == attribute.id }) ?? attribute
    }

    private var contributingSkills: [SkillNode] {
        let attrID = liveAttribute.id
        return model.skills.filter { skill in
            let mappings = model.phase6State.growthAttributeMappings[skill.id] ?? []
            return mappings.contains(where: { $0.attributeId == attrID })
        }
    }

    private var relatedTransactions: [LedgerTransaction] {
        model.transactions.filter { tx in
            tx.title.localizedCaseInsensitiveContains(liveAttribute.name)
        }
    }

    private var progressValue: Double {
        let req = max(1, liveAttribute.nextLevelXP)
        return min(1, max(0, Double(liveAttribute.currentXP) / Double(req)))
    }

    public var body: some View {
        IOSPage {
            // Header Progress Card
            IOSHeroCard {
                VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                    HStack {
                        Image(systemName: GrowthIconDescriptor.resolve(liveAttribute.icon).systemImage)
                            .font(.title.weight(.bold))
                            .foregroundStyle(IOSColor.mint(colorScheme))
                            .frame(width: 52, height: 52)
                            .background(Color.white.opacity(0.15), in: Circle())
                        Spacer()
                        Text("LEVEL \(liveAttribute.level)")
                            .font(IOSTypography.metric)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 6)
                            .background(Color.white.opacity(0.2), in: Capsule())
                    }

                    Text(liveAttribute.name)
                        .font(IOSTypography.largeTitle)
                        .foregroundStyle(.white)

                    VStack(alignment: .leading, spacing: 6) {
                        ProgressView(value: progressValue)
                            .tint(IOSColor.mint(colorScheme))
                        HStack {
                            Text("\(liveAttribute.currentXP) / \(liveAttribute.nextLevelXP) XP")
                                .font(IOSTypography.captionBold)
                            Spacer()
                            Text("\(max(0, liveAttribute.nextLevelXP - liveAttribute.currentXP)) XP to Level \(liveAttribute.level + 1)")
                                .font(IOSTypography.caption)
                                .foregroundStyle(.white.opacity(0.8))
                        }
                    }
                    .padding(.top, 4)
                }
            }

            // Contributing Skills Section
            IOSSection(title: "Contributing Skills", subtitle: "\(contributingSkills.count) mapped") {
                if contributingSkills.isEmpty {
                    IOSEmptyState(
                        icon: "brain.head.profile",
                        title: "No Mapped Skills",
                        description: "Map skills to this attribute in the Skills tab to route XP into \(liveAttribute.name)."
                    )
                } else {
                    VStack(spacing: IOSSpacing.tight) {
                        ForEach(contributingSkills) { skill in
                            NavigationLink(destination: GrowthSkillDetailView(skill: skill)) {
                                HStack(spacing: IOSSpacing.compact) {
                                    Image(systemName: GrowthIconDescriptor.resolve(skill.icon).systemImage)
                                        .font(.headline)
                                        .foregroundStyle(IOSColor.teal(colorScheme))
                                        .frame(width: 36, height: 36)
                                        .background(IOSColor.mintTint(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(skill.name)
                                            .font(IOSTypography.headline)
                                            .foregroundStyle(IOSColor.ink(colorScheme))
                                        Text("Level \(skill.level)")
                                            .font(IOSTypography.caption)
                                            .foregroundStyle(IOSColor.inkDim(colorScheme))
                                    }

                                    Spacer()

                                    Image(systemName: "chevron.right")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(IOSColor.inkFaint(colorScheme))
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

            // Recent Attribute XP Section
            IOSSection(title: "Recent XP Activity", subtitle: "\(relatedTransactions.count) transactions") {
                if relatedTransactions.isEmpty {
                    IOSEmptyState(
                        icon: "sparkles",
                        title: "No Activity Yet",
                        description: "Complete tasks or study sessions to earn XP for this attribute."
                    )
                } else {
                    VStack(spacing: IOSSpacing.tight) {
                        ForEach(relatedTransactions.prefix(8)) { tx in
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
        .navigationTitle(liveAttribute.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

public struct GrowthAttributesView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    private var attributes: [UserAttribute] {
        model.attributes.filter { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "general" }
    }

    public var body: some View {
        if attributes.isEmpty {
            IOSEmptyState(
                icon: "chart.pie.fill",
                title: "No Attributes Cached",
                description: "Attributes represent broad capability areas that level up as you complete work."
            )
        } else {
            VStack(spacing: IOSSpacing.compact) {
                ForEach(attributes) { attr in
                    NavigationLink(destination: GrowthAttributeDetailView(attribute: attr)) {
                        attributeCard(attr)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func attributeCard(_ attr: UserAttribute) -> some View {
        let req = max(1, attr.nextLevelXP)
        let progress = min(1, max(0, Double(attr.currentXP) / Double(req)))

        return IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                HStack(spacing: IOSSpacing.compact) {
                    Image(systemName: GrowthIconDescriptor.resolve(attr.icon).systemImage)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(IOSColor.teal(colorScheme))
                        .frame(width: 40, height: 40)
                        .background(IOSColor.mintTint(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(attr.name)
                            .font(IOSTypography.headline)
                            .foregroundStyle(IOSColor.ink(colorScheme))
                        Text("Level \(attr.level)")
                            .font(IOSTypography.captionBold)
                            .foregroundStyle(IOSColor.teal(colorScheme))
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(IOSColor.inkFaint(colorScheme))
                }

                VStack(alignment: .leading, spacing: 4) {
                    ProgressView(value: progress)
                        .tint(IOSColor.teal(colorScheme))
                    HStack {
                        Text("\(attr.currentXP) / \(attr.nextLevelXP) XP")
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.inkDim(colorScheme))
                        Spacer()
                        Text("\(max(0, attr.nextLevelXP - attr.currentXP)) XP to next level")
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.inkFaint(colorScheme))
                    }
                }
            }
        }
    }
}
