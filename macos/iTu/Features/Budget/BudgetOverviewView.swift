import SwiftUI

struct BudgetOverviewView: View {
    @Environment(AppModel.self) private var model
    @Binding var selectedPeriod: String
    var onAddTransactionClicked: () -> Void

    private var overview: BudgetOverviewModel? {
        model.budgetOverview
    }

    private var currency: String {
        model.budgetPreferences.defaultCurrency
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Period Navigation Toolbar
            HStack {
                HStack(spacing: 6) {
                    Button {
                        selectedPeriod = BudgetSupport.shiftPeriod(selectedPeriod, by: -1)
                    } label: {
                        Image(systemName: "chevron.left")
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Previous month")

                    Text(selectedPeriod)
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)

                    Button {
                        selectedPeriod = BudgetSupport.shiftPeriod(selectedPeriod, by: 1)
                    } label: {
                        Image(systemName: "chevron.right")
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Next month")

                    if selectedPeriod != BudgetSupport.currentPeriod {
                        Button("Current") {
                            selectedPeriod = BudgetSupport.currentPeriod
                        }
                        .buttonStyle(iTuSecondaryButtonStyle(height: 24))
                        .font(.system(size: 11))
                    }
                }

                Spacer()

                Button {
                    onAddTransactionClicked()
                } label: {
                    Label("Add Transaction", systemImage: "plus")
                }
                .buttonStyle(.borderedProminent)
                .tint(iTuTheme.teal)
                .controlSize(.small)
            }

            // Ready to Assign Hero Banner
            if let overview {
                let totalAssigned = overview.categories.reduce(0.0) { $0 + $1.budget }
                let readyToAssign = overview.income - totalAssigned
                let isDeficit = readyToAssign < 0
                HStack(spacing: 16) {
                    Image(systemName: isDeficit ? "exclamationmark.triangle.fill" : "checkmark.seal.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(isDeficit ? iTuTheme.coral : iTuTheme.mint)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(isDeficit ? "OVERASSIGNED" : "READY TO ASSIGN")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(isDeficit ? iTuTheme.coral : iTuTheme.mint)
                        Text(BudgetSupport.formatCurrency(readyToAssign, currency: currency))
                            .font(.system(size: 22, weight: .bold, design: .rounded))
                            .foregroundStyle(iTuTheme.ink)
                        Text(isDeficit ? "You have assigned more than your total monthly income." : "All income is accounted for and ready to fund categories.")
                            .font(.system(size: 11))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    Spacer()
                }
                .padding(16)
                .background(isDeficit ? iTuTheme.coral.opacity(0.08) : iTuTheme.surfaceMuted)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(isDeficit ? iTuTheme.coral.opacity(0.3) : iTuTheme.border, lineWidth: 1)
                }

                // 3 Metric Cards
                HStack(spacing: 14) {
                    metricCard(
                        title: "TOTAL INCOME",
                        value: BudgetSupport.formatCurrency(overview.income, currency: currency),
                        subtitle: "Monthly inflow",
                        tint: iTuTheme.mint
                    )
                    metricCard(
                        title: "ACTIVITY",
                        value: BudgetSupport.formatCurrency(overview.spent, currency: currency),
                        subtitle: "\(overview.categories.count) categories",
                        tint: iTuTheme.amber
                    )
                    metricCard(
                        title: "REMAINING",
                        value: BudgetSupport.formatCurrency(overview.remainingBudget, currency: currency),
                        subtitle: overview.remainingBudget < 0 ? "Overspent" : "Available",
                        tint: overview.remainingBudget < 0 ? iTuTheme.coral : iTuTheme.teal
                    )
                }

                // Category Breakdown Section
                VStack(alignment: .leading, spacing: 12) {
                    Text("CATEGORY SPENDING BREAKDOWN")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)

                    if overview.categories.isEmpty {
                        Text("No budget categories found for this month.")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.inkDim)
                            .padding(.vertical, 12)
                    } else {
                        VStack(spacing: 8) {
                            ForEach(overview.categories) { catStat in
                                categoryCard(catStat)
                            }
                        }
                    }
                }
            } else {
                ProgressView("Loading budget overview…")
                    .frame(maxWidth: .infinity, minHeight: 120)
            }
        }
    }

    private func metricCard(title: String, value: String, subtitle: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(tint)
            Text(value)
                .font(.system(size: 18, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.ink)
            Text(subtitle)
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }

    private func categoryCard(_ catStat: BudgetCategoryStatModel) -> some View {
        let assigned = catStat.budget
        let spent = catStat.spent
        let available = catStat.remaining
        let progress = assigned > 0 ? (spent / assigned) : (spent > 0 ? 1.0 : 0.0)
        let isOverspent = available < 0

        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                HStack(spacing: 8) {
                    Image(systemName: BudgetSupport.categorySymbol(catStat.category.icon))
                        .foregroundStyle(BudgetSupport.categoryTint(catStat.category.color))
                    Text(catStat.category.name)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                }
                Spacer()
                Text("Assigned: \(BudgetSupport.formatCurrency(assigned, currency: currency)) · Spent: \(BudgetSupport.formatCurrency(spent, currency: currency))")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            // Visual Progress Bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(iTuTheme.border)
                    Capsule()
                        .fill(isOverspent ? iTuTheme.coral : (progress > 0.85 ? iTuTheme.amber : iTuTheme.teal))
                        .frame(width: max(4, geo.size.width * min(CGFloat(progress), 1.0)))
                }
            }
            .frame(height: 6)

            HStack {
                Text("Available")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
                Spacer()
                Text(BudgetSupport.formatCurrency(available, currency: currency))
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundStyle(isOverspent ? iTuTheme.coral : iTuTheme.mint)
            }
        }
        .padding(12)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(isOverspent ? iTuTheme.coral.opacity(0.3) : iTuTheme.border, lineWidth: 1)
        }
    }
}

