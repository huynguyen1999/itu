import SwiftUI

enum GrowthReceiptXPLabel {
    static func label(for award: GrowthProgressAward) -> String {
        let isAttribute = award.awardType == .attribute || (award.awardType == nil && award.kind.uppercased() == "ATTRIBUTE")
        if isAttribute && (award.derivedFromSkillId != nil || !award.mappingSnapshot.isEmpty) {
            return GrowthLedgerXPKind.derivedAttribute.label
        }
        switch award.awardType {
        case .attribute: return GrowthLedgerXPKind.attribute.label
        case .derivedAttribute: return GrowthLedgerXPKind.derivedAttribute.label
        case .skill: return GrowthLedgerXPKind.skill.label
        case nil: return isAttribute ? GrowthLedgerXPKind.attribute.label : GrowthLedgerXPKind.skill.label
        }
    }
}

struct GrowthReceiptOverlay: View {
    let presented: PresentedGrowthReceipt
    let dismiss: () -> Void

    private var receipt: GrowthAwardReceipt { presented.receipt }
    private var accent: Color { receipt.isReversal ? iTuTheme.coral : iTuTheme.teal }
    private var statusTint: Color { receipt.isReversal ? iTuTheme.coralTint : iTuTheme.mintTint }
    private var statusTitle: String { receipt.isReversal ? "Growth reversed" : "Growth earned" }
    private var statusLabel: String { receipt.isReversal ? "REVERSED" : "EARNED" }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image(systemName: receipt.isReversal ? "arrow.uturn.backward.circle.fill" : "sparkles")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(accent)
                    .frame(width: 30, height: 30)
                    .background(accent.opacity(0.12), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(statusTitle)
                            .font(.system(size: 15, weight: .semibold, design: .rounded))
                            .foregroundStyle(iTuTheme.ink)
                        Text(statusLabel)
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .tracking(0.8)
                            .foregroundStyle(accent)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(statusTint, in: Capsule())
                    }
                    Text(receipt.title)
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Button(action: dismiss) {
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .semibold))
                        .frame(width: 28, height: 28)
                }
                .buttonStyle(.plain)
                .foregroundStyle(iTuTheme.inkDim)
                .accessibilityLabel("Dismiss growth receipt")
            }
            LazyVGrid(
                columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)],
                alignment: .leading,
                spacing: 10
            ) {
                if let account = receipt.accountAward {
                    receiptPill(icon: "person.crop.circle.badge.plus", amount: signed(account.amount), label: "Account XP")
                }
                ForEach(receipt.progressAwards) { award in
                    receiptPill(icon: award.icon, amount: signed(award.xpGained), label: GrowthReceiptXPLabel.label(for: award))
                }
                if let coins = receipt.coinAward {
                    receiptPill(icon: "CIRCLE_DOLLAR_SIGN", amount: signed(coins.amount), label: "Coins")
                }
                ForEach(receipt.itemAwards) { item in
                    receiptPill(icon: item.icon, amount: signed(item.quantity), label: item.name)
                }
            }
        }
        .padding(16)
        .frame(width: 370)
        .background {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [iTuTheme.surface, statusTint.opacity(0.18)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
        }
        .overlay { RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(iTuTheme.border, lineWidth: 1) }
        .shadow(color: iTuTheme.forest.opacity(0.14), radius: 14, y: 6)
        .accessibilityElement(children: .contain)
    }

    private func signed(_ value: Int) -> String {
        "\(receipt.isReversal ? "−" : "+")\(value)"
    }

    private func receiptPill(icon: String?, amount: String, label: String) -> some View {
        HStack(spacing: 8) {
            GrowthIconView(icon: icon, size: 14, color: accent)
                .frame(width: 24, height: 24)
                .background(accent.opacity(0.11), in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(amount)
                    .font(.system(size: 15, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.ink)
                Text(label)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(iTuTheme.inkDim)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .minimumScaleFactor(0.85)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(iTuTheme.canvas, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.borderSoft, lineWidth: 1)
        }
    }
}
