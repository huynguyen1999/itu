import SwiftUI

struct BudgetLimitsView: View {
    @Environment(AppModel.self) private var model
    @Binding var selectedPeriod: String

    @State private var overallTarget = ""
    @State private var isSavingOverall = false
    @State private var categoryLimitDrafts: [String: String] = [:]
    @State private var isSavingLimit: [String: Bool] = [:]

    private var currency: String {
        model.budgetPreferences.defaultCurrency
    }

    private var overview: BudgetOverviewModel? {
        model.budgetOverview
    }

    private var activeCategories: [BudgetCategoryModel] {
        model.budgetCategories.filter { $0.archivedAt == nil && $0.type == "EXPENSE" }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Overall Monthly Target Card
            VStack(alignment: .leading, spacing: 10) {
                Text("MONTHLY FUNDING TARGET")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.teal)

                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Overall Budget for \(selectedPeriod)")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                        Text("Set the total target you plan to assign across all expense categories.")
                            .font(.system(size: 11))
                            .foregroundStyle(iTuTheme.inkDim)
                    }

                    Spacer()

                    HStack(spacing: 8) {
                        TextField("0.00", text: $overallTarget)
                            .textFieldStyle(.roundedBorder)
                            .font(.system(size: 14, weight: .bold, design: .monospaced))
                            .frame(width: 120)

                        Button(isSavingOverall ? "Saving…" : "Save Target") {
                            saveOverallTarget()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(iTuTheme.teal)
                        .controlSize(.small)
                        .disabled(isSavingOverall)
                    }
                }
            }
            .padding(16)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(iTuTheme.border, lineWidth: 1)
            }

            // Category Limits / Assignment List
            VStack(alignment: .leading, spacing: 12) {
                Text("CATEGORY ASSIGNMENTS & TARGETS")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                if activeCategories.isEmpty {
                    Text("No active expense categories to budget.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    LazyVStack(spacing: 8) {
                        ForEach(activeCategories) { cat in
                            categoryBudgetRow(cat)
                        }
                    }
                }
            }
        }
        .onAppear {
            if let overview {
                overallTarget = String(format: "%.2f", overview.overallBudget)
                for catStat in overview.categories {
                    categoryLimitDrafts[catStat.category.id] = String(format: "%.2f", catStat.budget)
                }
            }
        }
        .onChange(of: overview) { _, newOverview in
            guard let newOverview else { return }
            if overallTarget.isEmpty {
                overallTarget = String(format: "%.2f", newOverview.overallBudget)
            }
            for catStat in newOverview.categories {
                if categoryLimitDrafts[catStat.category.id] == nil {
                    categoryLimitDrafts[catStat.category.id] = String(format: "%.2f", catStat.budget)
                }
            }
        }
    }

    private func categoryBudgetRow(_ cat: BudgetCategoryModel) -> some View {
        let catOverview = overview?.categories.first { $0.category.id == cat.id }
        let spent = catOverview?.spent ?? 0
        let assigned = catOverview?.budget ?? 0
        let draft = categoryLimitDrafts[cat.id] ?? String(format: "%.2f", assigned)
        let isSaving = isSavingLimit[cat.id] ?? false
        let progress = assigned > 0 ? (spent / assigned) : (spent > 0 ? 1.0 : 0.0)

        return HStack(spacing: 12) {
            // Category Icon & Name
            HStack(spacing: 8) {
                Image(systemName: BudgetSupport.categorySymbol(cat.icon))
                    .foregroundStyle(BudgetSupport.categoryTint(cat.color))
                VStack(alignment: .leading, spacing: 2) {
                    Text(cat.name)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    Text("Spent \(BudgetSupport.formatCurrency(spent, currency: currency))")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                }
            }
            .frame(width: 180, alignment: .leading)

            // Progress Bar
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(iTuTheme.border)
                    Capsule()
                        .fill(spent > assigned ? iTuTheme.coral : iTuTheme.teal)
                        .frame(width: max(4, geo.size.width * min(CGFloat(progress), 1.0)))
                }
            }
            .frame(height: 6)

            Spacer()

            // Assigned Input & Save
            HStack(spacing: 6) {
                TextField("0.00", text: Binding(
                    get: { categoryLimitDrafts[cat.id] ?? draft },
                    set: { categoryLimitDrafts[cat.id] = $0 }
                ))
                .textFieldStyle(.roundedBorder)
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .frame(width: 90)

                Button(isSaving ? "…" : "Assign") {
                    saveCategoryLimit(cat.id)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(isSaving)
            }
        }
        .padding(12)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }

    private func saveOverallTarget() {
        let trimmed = overallTarget.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let num = Double(trimmed.replacingOccurrences(of: ",", with: ".")), num >= 0 else { return }
        isSavingOverall = true
        Task {
            _ = await model.updateBudgetPeriod(period: selectedPeriod, overallLimit: String(format: "%.2f", num))
            isSavingOverall = false
        }
    }

    private func saveCategoryLimit(_ catID: String) {
        guard let draft = categoryLimitDrafts[catID],
              let num = Double(draft.replacingOccurrences(of: ",", with: ".")), num >= 0 else { return }
        isSavingLimit[catID] = true
        Task {
            _ = await model.updateBudgetCategoryLimit(period: selectedPeriod, categoryID: catID, limit: String(format: "%.2f", num))
            isSavingLimit[catID] = false
        }
    }
}

