import SwiftUI
import iTuDomain
import iTuDesignCore

public enum GrowthTab: String, CaseIterable, Identifiable {
    case attributes = "Attributes"
    case skills = "Skills"
    case rewards = "Rewards"
    case ledger = "Ledger"

    public var id: String { rawValue }

    public var systemImage: String {
        switch self {
        case .attributes: return "chart.pie.fill"
        case .skills:     return "brain.head.profile"
        case .rewards:    return "gift.fill"
        case .ledger:     return "list.bullet.rectangle.fill"
        }
    }
}

public typealias Phase6GrowthView = GrowthView

public struct GrowthView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var selectedTab: GrowthTab = .attributes
    @State private var showingSettingsSheet = false

    public init() {}

    private var profile: GrowthProfileDTO? {
        model.growthProfile
    }

    private var accountLevel: Int {
        model.growthLevel ?? 1
    }

    private var currentXP: Int {
        model.growthCurrentXp ?? 0
    }

    private var nextLevelXP: Int {
        max(1, model.growthNextLevelXp ?? 100)
    }

    private var progressValue: Double {
        min(1, max(0, Double(currentXP) / Double(nextLevelXP)))
    }

    public var body: some View {
        IOSPage {
            // Level & Coin Hero
            levelHeroCard

            // Inline Sync Issue Banner if needed
            IOSSyncIssueBanner()

            // Sub-navigation Filter Bar
            IOSFilterBar(
                items: GrowthTab.allCases,
                title: { $0.rawValue },
                icon: { $0.systemImage },
                selection: $selectedTab
            )
            .padding(.top, IOSSpacing.tight)

            // Tab Content
            switch selectedTab {
            case .attributes:
                GrowthAttributesView()
            case .skills:
                GrowthSkillsView()
            case .rewards:
                GrowthRewardsView()
            case .ledger:
                GrowthLedgerView()
            }
        }
        .navigationTitle("Growth")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                IOSSyncStatusIndicator()
            }
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingSettingsSheet = true
                } label: {
                    Image(systemName: "gearshape")
                        .font(IOSTypography.headline)
                        .foregroundStyle(IOSColor.teal(colorScheme))
                }
                .accessibilityLabel("Growth Settings")
            }
        }
        .sheet(isPresented: $showingSettingsSheet) {
            NavigationStack {
                GrowthSettingsView()
            }
            .presentationDetents([.medium, .large])
        }
    }

    // MARK: - Level Hero Card

    private var levelHeroCard: some View {
        IOSHeroCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                HStack {
                    Label("CHARACTER PROGRESSION", systemImage: "sparkles")
                        .font(IOSTypography.kicker)
                        .tracking(1.2)
                        .foregroundStyle(IOSColor.mint(colorScheme))

                    Spacer()

                    HStack(spacing: 4) {
                        Image(systemName: "circle.circle.fill")
                            .foregroundStyle(IOSColor.amber(colorScheme))
                        Text("\(model.userCoins) coins")
                            .font(IOSTypography.captionBold)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.white.opacity(0.18), in: Capsule())
                }

                HStack(alignment: .lastTextBaseline) {
                    Text("Level \(accountLevel)")
                        .font(IOSTypography.largeTitle)
                        .foregroundStyle(.white)
                    Spacer()
                    Text("\(currentXP) / \(nextLevelXP) XP")
                        .font(IOSTypography.headline)
                        .foregroundStyle(.white.opacity(0.9))
                }

                VStack(alignment: .leading, spacing: 6) {
                    ProgressView(value: progressValue)
                        .tint(IOSColor.mint(colorScheme))

                    Text("\(max(0, nextLevelXP - currentXP)) XP until Level \(accountLevel + 1)")
                        .font(IOSTypography.caption)
                        .foregroundStyle(.white.opacity(0.8))
                }
                .padding(.top, 4)
            }
        }
    }
}
