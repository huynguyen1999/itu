import SwiftUI
import iTuDomain
import iTuDesignCore

public struct GrowthLedgerDetailView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    let transaction: LedgerTransaction

    public init(transaction: LedgerTransaction) {
        self.transaction = transaction
    }

    public var body: some View {
        IOSPage {
            // Header Card
            IOSHeroCard {
                VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                    HStack {
                        Label(transaction.type.uppercased(), systemImage: "list.bullet.rectangle.fill")
                            .font(IOSTypography.kicker)
                            .tracking(1.2)
                            .foregroundStyle(IOSColor.mint(colorScheme))
                        Spacer()
                    }

                    Text(transaction.title)
                        .font(IOSTypography.title)
                        .foregroundStyle(.white)

                    Text(transaction.timestamp)
                        .font(IOSTypography.caption)
                        .foregroundStyle(.white.opacity(0.8))
                }
            }

            // Gains Breakdown Card
            IOSCard {
                VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                    Text("AWARD BREAKDOWN")
                        .font(IOSTypography.kicker)
                        .tracking(1.2)
                        .foregroundStyle(IOSColor.teal(colorScheme))

                    if transaction.amountXP != 0 {
                        HStack {
                            Label("Total XP", systemImage: "sparkles")
                                .font(IOSTypography.body)
                                .foregroundStyle(IOSColor.ink(colorScheme))
                            Spacer()
                            Text("+\(transaction.amountXP) XP")
                                .font(IOSTypography.headline)
                                .foregroundStyle(IOSColor.teal(colorScheme))
                        }
                    }

                    if transaction.amountAccountXP != 0 {
                        Divider()
                        HStack {
                            Label("Account XP", systemImage: "person.badge.shield.checkmark.fill")
                                .font(IOSTypography.body)
                                .foregroundStyle(IOSColor.ink(colorScheme))
                            Spacer()
                            Text("+\(transaction.amountAccountXP) XP")
                                .font(IOSTypography.headline)
                                .foregroundStyle(IOSColor.teal(colorScheme))
                        }
                    }

                    if transaction.amountSkillXP != 0 {
                        Divider()
                        HStack {
                            Label("Skill XP", systemImage: "brain.head.profile")
                                .font(IOSTypography.body)
                                .foregroundStyle(IOSColor.ink(colorScheme))
                            Spacer()
                            Text("+\(transaction.amountSkillXP) XP")
                                .font(IOSTypography.headline)
                                .foregroundStyle(IOSColor.teal(colorScheme))
                        }
                    }

                    if transaction.amountAttributeXP != 0 {
                        Divider()
                        HStack {
                            Label("Attribute XP", systemImage: "chart.pie.fill")
                                .font(IOSTypography.body)
                                .foregroundStyle(IOSColor.ink(colorScheme))
                            Spacer()
                            Text("+\(transaction.amountAttributeXP) XP")
                                .font(IOSTypography.headline)
                                .foregroundStyle(IOSColor.teal(colorScheme))
                        }
                    }

                    if transaction.amountCoins != 0 {
                        Divider()
                        HStack {
                            Label("Coins Earned", systemImage: "circle.circle.fill")
                                .font(IOSTypography.body)
                                .foregroundStyle(IOSColor.ink(colorScheme))
                            Spacer()
                            Text("+\(transaction.amountCoins) Coins")
                                .font(IOSTypography.headline)
                                .foregroundStyle(IOSColor.amber(colorScheme))
                        }
                    }
                }
            }
        }
        .navigationTitle("Transaction")
        .navigationBarTitleDisplayMode(.inline)
    }
}

public struct GrowthLedgerView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var selectedFilter: Filter = .all

    public enum Filter: String, CaseIterable, Identifiable {
        case all = "All"
        case xp = "XP"
        case coins = "Coins"

        public var id: String { rawValue }
    }

    public init() {}

    private var filteredTransactions: [LedgerTransaction] {
        switch selectedFilter {
        case .all:
            return model.transactions
        case .xp:
            return model.transactions.filter { $0.amountXP != 0 }
        case .coins:
            return model.transactions.filter { $0.amountCoins != 0 }
        }
    }

    public var body: some View {
        VStack(spacing: IOSSpacing.compact) {
            // Filter Bar
            IOSFilterBar(
                items: Filter.allCases,
                title: { $0.rawValue },
                selection: $selectedFilter
            )
            .padding(.top, IOSSpacing.tight)

            if filteredTransactions.isEmpty {
                IOSEmptyState(
                    icon: "list.bullet.rectangle.fill",
                    title: "No Ledger Entries",
                    description: "Transactions recording XP and coin adjustments will be listed here."
                )
            } else {
                VStack(spacing: IOSSpacing.tight) {
                    ForEach(filteredTransactions) { entry in
                        NavigationLink(destination: GrowthLedgerDetailView(transaction: entry)) {
                            HStack(spacing: IOSSpacing.compact) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(entry.title)
                                        .font(IOSTypography.subheadline)
                                        .fontWeight(.medium)
                                        .foregroundStyle(IOSColor.ink(colorScheme))
                                    Text(entry.timestamp)
                                        .font(IOSTypography.caption)
                                        .foregroundStyle(IOSColor.inkFaint(colorScheme))
                                }

                                Spacer()

                                VStack(alignment: .trailing, spacing: 2) {
                                    if entry.amountXP != 0 {
                                        Text("+\(entry.amountXP) XP")
                                            .font(IOSTypography.captionBold)
                                            .foregroundStyle(IOSColor.teal(colorScheme))
                                    }
                                    if entry.amountCoins != 0 {
                                        Text("+\(entry.amountCoins) coins")
                                            .font(IOSTypography.captionBold)
                                            .foregroundStyle(IOSColor.amber(colorScheme))
                                    }
                                }

                                Image(systemName: "chevron.right")
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(IOSColor.inkFaint(colorScheme))
                            }
                            .padding(.horizontal, IOSSpacing.normal)
                            .padding(.vertical, IOSSpacing.compact)
                            .background(
                                IOSColor.surface(colorScheme),
                                in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                            )
                            .overlay {
                                RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                                    .stroke(IOSColor.borderSoft(colorScheme), lineWidth: 1)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}
