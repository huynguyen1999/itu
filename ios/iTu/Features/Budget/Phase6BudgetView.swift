import SwiftUI
import iTuDomain

struct Phase6BudgetView: View {
    @EnvironmentObject private var model: AppModel
    @State private var amount = ""
    @State private var merchant = ""
    @State private var note = ""
    @State private var selectedCategoryID = ""
    @State private var expenseDate = Date()
    @State private var monthlyLimit = ""
    @State private var savedMonthlyLimit = ""
    @State private var categoryLimitDraft: [String: String] = [:]
    @State private var newCategoryName = ""
    @State private var pendingDelete: ExpenseModel?
    @State private var lastDeletedExpense: ExpenseModel?
    @State private var showingDeleteUndo = false
    @State private var pendingCategoryArchive: ExpenseCategoryModel?
    @State private var pendingRecurring: RecurringExpenseModel?

    private var period: String { String(IOSProductCalendar.dayString().prefix(7)) }
    private var overview: IOSBudgetOverview { model.budgetOverview(period: period) }
    private var categories: [ExpenseCategoryModel] { model.expenseCategories.filter { $0.archivedAt == nil }.sorted { $0.sortOrder < $1.sortOrder } }
    private var dirty: Bool { monthlyLimit != savedMonthlyLimit }

    var body: some View {
        List {
            SyncBanner()
            Section("This Month") {
                LabeledContent("Spent", value: IOSBudgetDisplay.money(overview.spent, currency: model.budgetPreferences.defaultCurrency))
                if let limit = overview.overallLimit {
                    LabeledContent("Remaining", value: IOSBudgetDisplay.money(overview.remaining ?? 0, currency: model.budgetPreferences.defaultCurrency))
                    ProgressView(value: min(1, max(0, NSDecimalNumber(decimal: overview.spent / max(limit, 1)).doubleValue)))
                        .accessibilityLabel("Monthly budget progress")
                        .accessibilityValue("Spent \(IOSBudgetDisplay.money(overview.spent, currency: model.budgetPreferences.defaultCurrency)) of \(IOSBudgetDisplay.money(limit, currency: model.budgetPreferences.defaultCurrency)); \(IOSBudgetDisplay.money(overview.remaining ?? 0, currency: model.budgetPreferences.defaultCurrency)) remaining")
                } else {
                    Text("No monthly limit set.").foregroundStyle(.secondary)
                }
            }

            Section("Quick Expense") {
                TextField("Amount", text: $amount).keyboardType(.decimalPad)
                if categories.isEmpty {
                    Text("Create an expense category first.").foregroundStyle(.secondary)
                } else {
                    Picker("Category", selection: $selectedCategoryID) {
                        ForEach(categories) { Text($0.name).tag($0.id) }
                    }
                    TextField("Merchant (optional)", text: $merchant)
                    DatePicker("Date", selection: $expenseDate, displayedComponents: .date)
                    TextField("Note (optional)", text: $note)
                    Button("Save Expense") { saveExpense() }
                        .buttonStyle(.borderedProminent)
                        .disabled(IOSBudgetMoney.normalized(amount, positive: true) == nil || selectedCategoryID.isEmpty)
                }
            }

            Section("Monthly Limit") {
                TextField("Overall limit", text: $monthlyLimit).keyboardType(.decimalPad)
                ViewThatFits(in: .horizontal) {
                    HStack {
                        Button("Save Limit") { saveLimit() }.disabled(!dirty)
                        if dirty { Button("Discard") { monthlyLimit = savedMonthlyLimit } }
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Button("Save Limit") { saveLimit() }.disabled(!dirty)
                        if dirty { Button("Discard") { monthlyLimit = savedMonthlyLimit } }
                    }
                }
            }

            Section("Categories") {
                if categories.isEmpty {
                    Text("No expense categories yet.").foregroundStyle(.secondary)
                } else {
                    ForEach(categories) { category in
                        HStack {
                            Label(category.name, systemImage: category.icon ?? "tag")
                            Spacer()
                            Button("Archive", role: .destructive) { pendingCategoryArchive = category }
                                .buttonStyle(.borderless)
                        }
                    }
                }
                ViewThatFits(in: .horizontal) {
                    HStack {
                        categoryNameField
                        addCategoryButton
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        categoryNameField
                        addCategoryButton
                    }
                }
            }

            categoryLimitsSection

            Section("Expenses") {
                let expenses = model.expenses.filter { $0.deletedAt == nil && String($0.expenseDate.prefix(7)) == period }
                if expenses.isEmpty {
                    Text("No expenses this month.").foregroundStyle(.secondary)
                } else {
                    ForEach(expenses) { expense in
                        expenseRow(expense)
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button("Move to Trash", role: .destructive) { pendingDelete = expense }
                            }
                            .accessibilityElement(children: .combine)
                            .accessibilityAction(named: "Move expense to Trash") { pendingDelete = expense }
                    }
                }
            }

            Section("Recurring") {
                let recurring = model.recurringExpenses.filter { $0.isActive && $0.archivedAt == nil }
                if recurring.isEmpty {
                    Text("No recurring expenses.").foregroundStyle(.secondary)
                } else {
                    ForEach(recurring) { item in
                        ViewThatFits(in: .horizontal) {
                            HStack {
                                recurringSummary(item)
                                Spacer(minLength: 8)
                                recurringActions(item)
                            }
                            VStack(alignment: .leading, spacing: 8) {
                                recurringSummary(item)
                                recurringActions(item)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Budget")
        .confirmationDialog(
            "Move expense to Trash?",
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            )
        ) {
            if let expense = pendingDelete {
                Button("Move to Trash", role: .destructive) {
                    pendingDelete = nil
                    Task {
                        if await model.deleteBudgetExpense(id: expense.id) {
                            lastDeletedExpense = expense
                            showingDeleteUndo = true
                        }
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            if let expense = pendingDelete {
                Text("\(expense.merchant ?? expense.category) remains recoverable until permanently deleted.")
            }
        }
        .confirmationDialog(
            "Archive this category?",
            isPresented: Binding(
                get: { pendingCategoryArchive != nil },
                set: { if !$0 { pendingCategoryArchive = nil } }
            )
        ) {
            if let category = pendingCategoryArchive {
                Button("Archive Category", role: .destructive) { Task { _ = await model.archiveBudgetCategory(id: category.id) } }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            if let category = pendingCategoryArchive {
                Text("Existing expenses remain intact, but new expenses cannot use \(category.name).")
            }
        }
        .confirmationDialog(
            "Confirm recurring expense?",
            isPresented: Binding(
                get: { pendingRecurring != nil },
                set: { if !$0 { pendingRecurring = nil } }
            )
        ) {
            if let item = pendingRecurring {
                Button("Confirm Expense") { Task { _ = await model.confirmRecurringExpense(id: item.id) } }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            if let item = pendingRecurring {
                Text("This records \(item.amount, format: .number) as an Expense for \(item.nextDueDate).")
            }
        }
        .alert("Expense moved to Trash", isPresented: $showingDeleteUndo) {
            Button("Undo") {
                guard let expense = lastDeletedExpense else { return }
                lastDeletedExpense = nil
                Task { _ = await model.restoreBudgetExpense(id: expense.id) }
            }
            Button("Done", role: .cancel) { lastDeletedExpense = nil }
        } message: {
            Text("The expense remains recoverable from Trash.")
        }
        .onAppear {
            let value = model.monthlyBudgets.first(where: { $0.period == period })?.overallLimit
            monthlyLimit = value.map { String($0) } ?? ""
            savedMonthlyLimit = monthlyLimit
            selectedCategoryID = selectedCategoryID.isEmpty ? categories.first?.id ?? "" : selectedCategoryID
        }
        .preference(key: IOSNavigationDirtyPreferenceKey.self, value: dirty ? [.budget] : [])
    }

    @ViewBuilder
    private func expenseRow(_ expense: ExpenseModel) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack {
                expenseSummary(expense)
                Spacer(minLength: 8)
                Text(IOSBudgetDisplay.money(expense.amount, currency: model.budgetPreferences.defaultCurrency))
                expenseDeleteButton(expense)
            }
            VStack(alignment: .leading, spacing: 8) {
                expenseSummary(expense)
                HStack {
                    Spacer()
                    Text(IOSBudgetDisplay.money(expense.amount, currency: model.budgetPreferences.defaultCurrency))
                    expenseDeleteButton(expense)
                }
            }
        }
    }

    private func expenseSummary(_ expense: ExpenseModel) -> some View {
        VStack(alignment: .leading) {
            Text(expense.merchant ?? expense.category)
            Text("\(expense.category) · \(expense.expenseDate)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func expenseDeleteButton(_ expense: ExpenseModel) -> some View {
        Button("Move to Trash", systemImage: "trash", role: .destructive) { pendingDelete = expense }
            .labelStyle(.iconOnly)
            .accessibilityLabel("Move \(expense.merchant ?? expense.category) to Trash")
    }

    private func recurringSummary(_ item: RecurringExpenseModel) -> some View {
        VStack(alignment: .leading) {
            Text(item.name ?? item.category)
            Text("Due \(item.nextDueDate) · \(item.frequency)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func recurringActions(_ item: RecurringExpenseModel) -> some View {
        HStack {
            Button("Confirm") { pendingRecurring = item }
                .buttonStyle(.bordered)
            Button("Skip") { Task { _ = await model.skipRecurringExpense(id: item.id) } }
                .buttonStyle(.bordered)
        }
    }

    @ViewBuilder
    private var categoryLimitsSection: some View {
        Section("Category Limits") {
            if categories.isEmpty {
                Text("Add a category to set a monthly limit.").foregroundStyle(.secondary)
            } else {
                ForEach(categories) { category in
                    let existing = model.monthlyBudgets.first(where: { $0.period == period })?.categoryLimits.first(where: { $0.categoryId == category.id })?.limit
                    ViewThatFits(in: .horizontal) {
                        HStack {
                            Text(category.name)
                            categoryLimitRow(category: category, existing: existing)
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            Text(category.name)
                            categoryLimitRow(category: category, existing: existing)
                        }
                    }
                }
            }
        }
    }

    private var categoryNameField: some View {
        TextField("New category", text: $newCategoryName)
    }

    private var addCategoryButton: some View {
        Button("Add") {
            let name = newCategoryName
            Task {
                if await model.createBudgetCategory(name: name) { newCategoryName = "" }
            }
        }
        .disabled(newCategoryName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func categoryLimitRow(category: ExpenseCategoryModel, existing: Double?) -> some View {
        HStack {
            TextField("No limit", text: Binding(
                get: { categoryLimitDraft[category.id] ?? existing.map { String($0) } ?? "" },
                set: { categoryLimitDraft[category.id] = $0 }
            ))
            .multilineTextAlignment(.trailing)
            .keyboardType(.decimalPad)
            Button("Save") {
                let value = categoryLimitDraft[category.id] ?? existing.map { String($0) } ?? ""
                Task { _ = await model.updateBudgetCategoryLimit(period: period, categoryID: category.id, limit: value) }
            }
            .disabled(IOSBudgetMoney.normalized(categoryLimitDraft[category.id] ?? existing.map { String($0) } ?? "") == nil)
        }
    }

    private func saveExpense() {
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        Task {
            if await model.createBudgetExpense(amount: amount, categoryID: selectedCategoryID, merchant: merchant.isEmpty ? nil : merchant, expenseDate: formatter.string(from: expenseDate), note: note.isEmpty ? nil : note) {
                amount = ""; merchant = ""; note = ""
            }
        }
    }

    private func saveLimit() {
        Task {
            if await model.updateMonthlyBudget(period: period, overallLimit: monthlyLimit.isEmpty ? nil : monthlyLimit) { savedMonthlyLimit = monthlyLimit }
        }
    }
}

private enum IOSBudgetDisplay {
    static func money(_ value: Decimal, currency: String) -> String {
        "\(currency) \(NSDecimalNumber(decimal: value).stringValue)"
    }

    static func money(_ value: Double, currency: String) -> String {
        money(Decimal(string: String(value), locale: Locale(identifier: "en_US_POSIX")) ?? .zero, currency: currency)
    }
}
