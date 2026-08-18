import SwiftUI
import iTuDomain
import iTuDesignCore

public typealias Phase6BudgetView = BudgetView

public enum IOSBudgetDisplay {
    public static func money(_ amount: Decimal, currency: String = "USD") -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        return formatter.string(from: NSDecimalNumber(decimal: amount)) ?? "$\(amount)"
    }

    public static func money(_ amount: Double, currency: String = "USD") -> String {
        money(Decimal(amount), currency: currency)
    }
}

public struct BudgetView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var amount = ""
    @State private var merchant = ""
    @State private var note = ""
    @State private var selectedCategoryID = ""
    @State private var expenseDate = Date()
    @State private var monthlyLimit = ""
    @State private var savedMonthlyLimit = ""

    public init() {}

    private var period: String { String(IOSProductCalendar.dayString().prefix(7)) }
    private var overview: IOSBudgetOverview { model.budgetOverview(period: period) }
    private var categories: [ExpenseCategoryModel] { model.expenseCategories.filter { $0.archivedAt == nil }.sorted { $0.sortOrder < $1.sortOrder } }
    private var activeExpenses: [ExpenseModel] { model.expenses.filter { $0.deletedAt == nil && String($0.expenseDate.prefix(7)) == period } }
    private var dirty: Bool { monthlyLimit != savedMonthlyLimit }

    public var body: some View {
        IOSPage {
            // Overview Hero Card
            overviewHeroCard

            // Sync issue banner
            IOSSyncIssueBanner()

            // Quick Expense Entry
            quickExpenseCard

            // Monthly Limit & Budgeting
            monthlyLimitCard

            // Recent Expenses List
            recentExpensesSection
        }
        .navigationTitle("Budget")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                IOSSyncStatusIndicator()
            }
        }
        .task {
            monthlyLimit = overview.overallLimit.map { NSDecimalNumber(decimal: $0).stringValue } ?? ""
            savedMonthlyLimit = monthlyLimit
            if selectedCategoryID.isEmpty, let first = categories.first {
                selectedCategoryID = first.id
            }
        }
    }

    // MARK: - Overview Hero

    private var overviewHeroCard: some View {
        IOSHeroCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                HStack {
                    Label("MONTHLY BUDGET", systemImage: "creditcard.fill")
                        .font(IOSTypography.kicker)
                        .tracking(1.2)
                        .foregroundStyle(IOSColor.mint(colorScheme))
                    Spacer()
                }

                HStack(alignment: .lastTextBaseline) {
                    Text(IOSBudgetDisplay.money(overview.spent, currency: model.budgetPreferences.defaultCurrency))
                        .font(IOSTypography.largeTitle)
                        .foregroundStyle(.white)
                    Spacer()
                    if let limit = overview.overallLimit {
                        Text("of \(IOSBudgetDisplay.money(limit, currency: model.budgetPreferences.defaultCurrency))")
                            .font(IOSTypography.headline)
                            .foregroundStyle(.white.opacity(0.85))
                    }
                }

                if let limit = overview.overallLimit {
                    let progress = min(1, max(0, NSDecimalNumber(decimal: overview.spent / max(limit, 1)).doubleValue))
                    VStack(alignment: .leading, spacing: 4) {
                        ProgressView(value: progress)
                            .tint(progress > 0.9 ? IOSColor.coral(colorScheme) : IOSColor.mint(colorScheme))
                        HStack {
                            Text("\(IOSBudgetDisplay.money(overview.remaining ?? 0, currency: model.budgetPreferences.defaultCurrency)) remaining")
                                .font(IOSTypography.captionBold)
                            Spacer()
                            Text("\(Int(progress * 100))% used")
                                .font(IOSTypography.caption)
                                .foregroundStyle(.white.opacity(0.8))
                        }
                    }
                    .padding(.top, 4)
                }
            }
        }
    }

    // MARK: - Quick Expense Card

    private var quickExpenseCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                Text("LOG EXPENSE")
                    .font(IOSTypography.kicker)
                    .tracking(1.2)
                    .foregroundStyle(IOSColor.teal(colorScheme))

                HStack(spacing: IOSSpacing.compact) {
                    TextField("0.00", text: $amount)
                        .keyboardType(.decimalPad)
                        .font(IOSTypography.title)
                        .frame(maxWidth: 120)
                        .padding(IOSSpacing.compact)
                        .background(IOSColor.surfaceMuted(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))

                    if !categories.isEmpty {
                        Picker("Category", selection: $selectedCategoryID) {
                            ForEach(categories) { Text($0.name).tag($0.id) }
                        }
                        .pickerStyle(.menu)
                    }
                }

                TextField("Merchant / Description", text: $merchant)
                    .font(IOSTypography.subheadline)
                    .padding(IOSSpacing.compact)
                    .background(IOSColor.surfaceMuted(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))

                Button {
                    saveExpense()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "plus")
                        Text("Add Expense")
                    }
                    .font(IOSTypography.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(IOSColor.teal(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))
                    .foregroundStyle(.white)
                }
                .buttonStyle(.plain)
                .disabled(IOSBudgetMoney.normalized(amount, positive: true) == nil || selectedCategoryID.isEmpty)
            }
        }
    }

    // MARK: - Monthly Limit Card

    private var monthlyLimitCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                Text("MONTHLY TARGET")
                    .font(IOSTypography.kicker)
                    .tracking(1.2)
                    .foregroundStyle(IOSColor.teal(colorScheme))

                HStack {
                    TextField("Set limit", text: $monthlyLimit)
                        .keyboardType(.decimalPad)
                        .font(IOSTypography.headline)

                    if dirty {
                        Button("Save") {
                            saveMonthlyLimit()
                        }
                        .font(IOSTypography.captionBold)
                        .buttonStyle(.borderedProminent)
                        .tint(IOSColor.teal(colorScheme))
                    }
                }
            }
        }
    }

    // MARK: - Recent Expenses

    private var recentExpensesSection: some View {
        IOSSection(title: "Recent Transactions", subtitle: "\(activeExpenses.count) entries") {
            if activeExpenses.isEmpty {
                IOSEmptyState(
                    icon: "creditcard",
                    title: "No Expenses Logged",
                    description: "Log expenses above to stay on top of your monthly budget."
                )
            } else {
                VStack(spacing: IOSSpacing.tight) {
                    ForEach(activeExpenses.prefix(8)) { exp in
                        HStack(spacing: IOSSpacing.compact) {
                            Image(systemName: "cart.fill")
                                .font(.headline)
                                .foregroundStyle(IOSColor.teal(colorScheme))
                                .frame(width: 36, height: 36)
                                .background(IOSColor.mintTint(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous))

                            VStack(alignment: .leading, spacing: 2) {
                                Text(exp.merchant ?? "Expense")
                                    .font(IOSTypography.headline)
                                    .foregroundStyle(IOSColor.ink(colorScheme))
                                Text(exp.expenseDate)
                                    .font(IOSTypography.caption)
                                    .foregroundStyle(IOSColor.inkDim(colorScheme))
                            }

                            Spacer()

                            Text(IOSBudgetDisplay.money(exp.amount, currency: model.budgetPreferences.defaultCurrency))
                                .font(IOSTypography.headline)
                                .foregroundStyle(IOSColor.ink(colorScheme))
                        }
                        .padding(IOSSpacing.normal)
                        .background(IOSColor.surface(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous).stroke(IOSColor.borderSoft(colorScheme), lineWidth: 1))
                    }
                }
            }
        }
    }

    // MARK: - Actions

    private func saveExpense() {
        guard let normalizedAmount = IOSBudgetMoney.normalized(amount, positive: true) else { return }
        let trimmedMerchant = merchant.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)

        Task {
            let success = await model.createBudgetExpense(
                amount: normalizedAmount,
                categoryID: selectedCategoryID,
                merchant: trimmedMerchant.isEmpty ? nil : trimmedMerchant,
                paymentMethod: "OTHER",
                expenseDate: IOSProductCalendar.dayString(expenseDate),
                note: trimmedNote.isEmpty ? nil : trimmedNote
            )
            if success {
                amount = ""
                merchant = ""
                note = ""
            }
        }
    }

    private func saveMonthlyLimit() {
        let trimmed = monthlyLimit.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let normalized = IOSBudgetMoney.normalized(trimmed) else { return }

        Task {
            let success = await model.updateMonthlyBudget(period: period, overallLimit: normalized)
            if success {
                savedMonthlyLimit = monthlyLimit
            }
        }
    }
}
