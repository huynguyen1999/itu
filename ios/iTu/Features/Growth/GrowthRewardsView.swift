import SwiftUI
import iTuDomain
import iTuDesignCore

public struct GrowthRewardsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme

    @State private var mode: Mode = .shop
    @State private var pendingRedeemItem: ShopItem?
    @State private var isRedeeming = false

    private enum Mode: String, CaseIterable, Identifiable {
        case shop = "Shop"
        case inventory = "Inventory"
        var id: String { rawValue }
    }

    public init() {}

    public var body: some View {
        VStack(spacing: IOSSpacing.compact) {
            // Mode Segmented Picker
            Picker("Rewards Mode", selection: $mode) {
                ForEach(Mode.allCases) { m in
                    Text(m.rawValue).tag(m)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, IOSSpacing.normal)
            .padding(.top, IOSSpacing.tight)

            if mode == .shop {
                shopContent
            } else {
                inventoryContent
            }
        }
        .confirmationDialog(
            "Redeem \(pendingRedeemItem?.title ?? "Reward")?",
            isPresented: Binding(
                get: { pendingRedeemItem != nil },
                set: { if !$0 { pendingRedeemItem = nil } }
            )
        ) {
            if let item = pendingRedeemItem {
                Button("Redeem for \(item.costCoins) Coins") {
                    redeem(item)
                }
                Button("Cancel", role: .cancel) { pendingRedeemItem = nil }
            }
        } message: {
            if let item = pendingRedeemItem {
                Text("This will deduct \(item.costCoins) coins from your balance (\(model.userCoins) available).")
            }
        }
    }

    // MARK: - Shop Content

    private var shopContent: some View {
        Group {
            if model.shopItems.isEmpty {
                IOSEmptyState(
                    icon: "bag.fill",
                    title: "Shop is Empty",
                    description: "Add rewards to spend your earned coins on meaningful treats."
                )
            } else {
                VStack(spacing: IOSSpacing.compact) {
                    ForEach(model.shopItems) { item in
                        shopItemCard(item)
                    }
                }
            }
        }
    }

    private func shopItemCard(_ item: ShopItem) -> some View {
        let canAfford = model.userCoins >= item.costCoins
        let isAlreadyPurchased = !item.repeatable && item.isPurchased

        return IOSCard {
            HStack(spacing: IOSSpacing.compact) {
                Image(systemName: GrowthIconDescriptor.resolve(item.icon).systemImage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(IOSColor.amber(colorScheme))
                    .frame(width: 44, height: 44)
                    .background(IOSColor.amberTint(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .font(IOSTypography.headline)
                        .foregroundStyle(IOSColor.ink(colorScheme))
                    if !item.description.isEmpty {
                        Text(item.description)
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.inkDim(colorScheme))
                            .lineLimit(2)
                    }
                    HStack(spacing: 6) {
                        Image(systemName: "circle.circle.fill")
                            .font(.caption2)
                            .foregroundStyle(IOSColor.amber(colorScheme))
                        Text("\(item.costCoins) coins")
                            .font(IOSTypography.captionBold)
                            .foregroundStyle(IOSColor.amber(colorScheme))
                        if item.repeatable {
                            Text("· Repeatable")
                                .font(IOSTypography.caption)
                                .foregroundStyle(IOSColor.inkFaint(colorScheme))
                        }
                    }
                }

                Spacer()

                if isAlreadyPurchased {
                    Text("Purchased")
                        .font(IOSTypography.captionBold)
                        .foregroundStyle(IOSColor.teal(colorScheme))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(IOSColor.mintTint(colorScheme), in: Capsule())
                } else {
                    Button {
                        pendingRedeemItem = item
                    } label: {
                        Text("Redeem")
                            .font(IOSTypography.captionBold)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(canAfford ? IOSColor.amber(colorScheme) : IOSColor.surfaceMuted(colorScheme), in: Capsule())
                            .foregroundStyle(canAfford ? .white : IOSColor.inkFaint(colorScheme))
                    }
                    .buttonStyle(.plain)
                    .disabled(!canAfford || isRedeeming)
                }
            }
        }
    }

    private func redeem(_ item: ShopItem) {
        isRedeeming = true
        Task {
            _ = await model.redeemGrowthReward(item)
            isRedeeming = false
            pendingRedeemItem = nil
        }
    }

    // MARK: - Inventory Content

    private var inventoryContent: some View {
        Group {
            if model.inventoryItems.isEmpty {
                IOSEmptyState(
                    icon: "shippingbox.fill",
                    title: "Inventory is Empty",
                    description: "Redeemed rewards and items will appear in your inventory."
                )
            } else {
                VStack(spacing: IOSSpacing.compact) {
                    ForEach(model.inventoryItems) { item in
                        inventoryItemCard(item)
                    }
                }
            }
        }
    }

    private func inventoryItemCard(_ item: InventoryItem) -> some View {
        IOSCard {
            HStack(spacing: IOSSpacing.compact) {
                Image(systemName: GrowthIconDescriptor.resolve(item.icon).systemImage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(IOSColor.teal(colorScheme))
                    .frame(width: 44, height: 44)
                    .background(IOSColor.mintTint(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .font(IOSTypography.headline)
                        .foregroundStyle(IOSColor.ink(colorScheme))
                    Text("Owned item")
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                }

                Spacer()

                Text("×\(item.quantity)")
                    .font(IOSTypography.metric)
                    .foregroundStyle(IOSColor.teal(colorScheme))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(IOSColor.mintTint(colorScheme), in: Capsule())
            }
        }
    }
}
