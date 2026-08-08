import SwiftUI

struct BudgetView: View {
    @Environment(AppModel.self) private var model
    @State private var selectedTab = "Overview"

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("TRACKING")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(iTuTheme.mint)
                    Text("Budget & Finances")
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                }
                Spacer()
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)

            // Segmented Local Nav
            Picker("Tab", selection: $selectedTab) {
                Text("Overview").tag("Overview")
                Text("Transactions").tag("Transactions")
                Text("Budgets").tag("Budgets")
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 24)

            // Body Content
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if selectedTab == "Overview" {
                        budgetOverviewSection
                    } else if selectedTab == "Transactions" {
                        transactionsSection
                    } else {
                        budgetsSection
                    }
                }
                .padding(24)
            }
        }
        .background(iTuTheme.canvas)
    }

    @ViewBuilder
    private var budgetOverviewSection: some View {
        HStack(spacing: 16) {
            metricCard(title: "TOTAL INCOME", value: "$3,000", color: iTuTheme.teal)
            metricCard(title: "TOTAL SPENT", value: "$1,250", color: iTuTheme.coral)
            metricCard(title: "REMAINING", value: "$1,750", color: iTuTheme.mint)
        }

        VStack(alignment: .leading, spacing: 12) {
            Text("Category Budgets")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            VStack(spacing: 8) {
                categoryRow(name: "Food & Dining", spent: 450, budget: 600)
                categoryRow(name: "Shopping", spent: 300, budget: 400)
                categoryRow(name: "Bills & Utilities", spent: 500, budget: 500)
            }
        }
        .padding(.top, 12)
    }

    @ViewBuilder
    private var transactionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recent Transactions")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            Text("No recent transactions recorded.")
                .font(.system(size: 13))
                .foregroundStyle(iTuTheme.inkDim)
        }
    }

    @ViewBuilder
    private var budgetsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Monthly Limits")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            Text("Overall Monthly Budget: $2,500")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
        }
    }

    private func metricCard(title: String, value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(color)
            Text(value)
                .font(.system(size: 20, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        )
    }

    private func categoryRow(name: String, spent: Int, budget: Int) -> some View {
        let progress = budget > 0 ? CGFloat(spent) / CGFloat(budget) : 0
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Text("$\(spent) / $\(budget)")
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(iTuTheme.border)
                    Capsule()
                        .fill(progress > 0.9 ? iTuTheme.coral : iTuTheme.teal)
                        .frame(width: max(4, geo.size.width * min(progress, 1)))
                }
            }
            .frame(height: 6)
        }
        .padding(12)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}
