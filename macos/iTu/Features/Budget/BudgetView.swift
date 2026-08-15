import SwiftUI

struct BudgetView: View {
    @Environment(AppModel.self) private var model
    @SceneStorage("budget.selectedTab") private var selectedTab = "Overview"
    @SceneStorage("budget.selectedPeriod") private var selectedPeriod = BudgetSupport.currentPeriod

    private let tabs = ["Overview", "Expenses", "Budgets", "Recurring", "Reports", "Categories"]

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 6) {
                Text("BUDGET").font(.system(size: 10, weight: .bold)).tracking(1.4).foregroundStyle(iTuTheme.mint)
                Text("Spending").font(.system(size: 22, weight: .bold, design: .rounded))
                Divider().padding(.vertical, 12)
                ForEach(tabs, id: \.self) { tab in
                    Button { selectedTab = tab } label: {
                        Label(tab, systemImage: BudgetSupport.tabIcon(tab))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 10).padding(.vertical, 8)
                            .background(selectedTab == tab ? iTuTheme.teal.opacity(0.14) : .clear)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(selectedTab == tab ? iTuTheme.teal : iTuTheme.inkDim)
                }
                Spacer()
            }
            .padding(20).frame(width: 190).background(iTuTheme.surface)

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(selectedTab.uppercased()).font(.system(size: 10, weight: .bold)).tracking(1.2).foregroundStyle(iTuTheme.teal)
                        Text("Budget").font(.system(size: 26, weight: .bold, design: .rounded))
                    }
                    Spacer()
                    Text(selectedPeriod).font(.system(size: 13, weight: .semibold))
                    Button { selectedPeriod = BudgetSupport.shiftPeriod(selectedPeriod, by: -1) } label: { Image(systemName: "chevron.left") }.buttonStyle(.plain)
                    Button { selectedPeriod = BudgetSupport.shiftPeriod(selectedPeriod, by: 1) } label: { Image(systemName: "chevron.right") }.buttonStyle(.plain)
                }
                .padding(24)
                Divider()
                ScrollView {
                    Group {
                        switch selectedTab {
                        case "Overview": BudgetOverviewView(period: selectedPeriod)
                        case "Expenses": BudgetExpensesView(period: selectedPeriod)
                        case "Budgets": BudgetLimitsView(period: selectedPeriod)
                        case "Recurring": BudgetRecurringView()
                        case "Reports": BudgetReportsView(period: selectedPeriod)
                        default: BudgetCategoriesView()
                        }
                    }
                    .padding(24).frame(maxWidth: 980, alignment: .topLeading)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .background(iTuTheme.canvas)
        .task { await loadSelectedTab() }
        .onChange(of: selectedTab) { _, _ in Task { await loadSelectedTab() } }
        .onChange(of: selectedPeriod) { _, _ in Task { await loadSelectedTab() } }
    }

    private func loadSelectedTab() async {
        switch selectedTab {
        case "Overview": await model.loadBudgetSummary(period: selectedPeriod)
        case "Expenses": await model.loadBudgetExpenses(period: selectedPeriod)
        case "Budgets": await model.loadMonthlyBudget(period: selectedPeriod); await model.loadBudgetSummary(period: selectedPeriod)
        case "Recurring": await model.loadRecurringExpenses()
        case "Reports": await model.loadBudgetReport(period: selectedPeriod)
        default: await model.loadBudgetCategories()
        }
        if model.expenseCategories.isEmpty { await model.loadBudgetCategories() }
    }
}

struct BudgetOverviewView: View {
    @Environment(AppModel.self) private var model
    let period: String

    var body: some View {
        let summary = model.budgetSummary
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                metric("Spent this month", value: amount(summary?.spent ?? 0))
                metric("Budget remaining", value: summary?.remaining.map(amount) ?? "No monthly limit")
                metric("Change vs previous", value: summary?.changePercentage.map { String(format: "%+.1f%%", $0) } ?? "—")
            }
            if let summary {
                if summary.overallLimit == nil {
                    Text("No monthly limit").font(.headline)
                } else {
                    progress(summary.spent, limit: summary.overallLimit ?? 0)
                }
                section("Top spending categories") {
                    ForEach(summary.categories.prefix(5)) { category in
                        HStack { Text(category.name); Spacer(); Text(amount(category.spent)).foregroundStyle(iTuTheme.inkDim) }
                    }
                }
                section("Recent expenses") {
                    ForEach(summary.recentExpenses.prefix(5)) { expense in
                        HStack { Text(expense.merchant ?? expense.category); Spacer(); Text("−\(amount(expense.amount))") }
                    }
                }
                if !summary.dueRecurring.isEmpty {
                    section("Due recurring expenses") {
                        ForEach(summary.dueRecurring) { recurring in
                            HStack { Text(recurring.name ?? recurring.merchant ?? recurring.category); Spacer(); Text(amount(recurring.amount)) }
                        }
                    }
                }
            } else {
                ProgressView()
            }
        }
    }

    private func metric(_ title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) { Text(title).font(.caption).foregroundStyle(iTuTheme.inkDim); Text(value).font(.title3.weight(.bold)) }
            .frame(maxWidth: .infinity, alignment: .leading).padding(16).iTuPanel(radius: 12)
    }

    private func progress(_ spent: Double, limit: Double) -> some View {
        let ratio = limit > 0 ? min(spent / limit, 1) : 0
        return VStack(alignment: .leading, spacing: 8) {
            HStack { Text("Overall budget").font(.headline); Spacer(); Text("\(amount(spent)) of \(amount(limit))").foregroundStyle(iTuTheme.inkDim) }
            ProgressView(value: ratio).tint(spent > limit ? iTuTheme.coral : iTuTheme.teal)
        }.padding(16).iTuPanel(radius: 12)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) { Text(title).font(.headline); VStack(alignment: .leading, spacing: 10, content: content).padding(16).iTuPanel(radius: 12) }
    }

    private func amount(_ value: Double) -> String { BudgetSupport.formatCurrency(value, currency: model.budgetPreferences.defaultCurrency) }
}

struct BudgetExpensesView: View {
    @Environment(AppModel.self) private var model
    let period: String
    @State private var search = ""
    @State private var categoryID = ""
    @State private var paymentMethod = ""
    @State private var showAdd = false
    @State private var editingExpense: ExpenseModel?

    private var values: [ExpenseModel] {
        model.expenses.filter { expense in
            expense.deletedAt == nil && String(expense.expenseDate.prefix(7)) == period &&
            (search.isEmpty || expense.merchant?.localizedCaseInsensitiveContains(search) == true || expense.category.localizedCaseInsensitiveContains(search) || expense.note?.localizedCaseInsensitiveContains(search) == true)
                && (categoryID.isEmpty || expense.categoryId == categoryID)
                && (paymentMethod.isEmpty || expense.paymentMethod == paymentMethod)
        }.sorted { ($0.expenseDate, $0.createdAt ?? "") > ($1.expenseDate, $1.createdAt ?? "") }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                TextField("Search merchant or category", text: $search).textFieldStyle(.roundedBorder)
                Picker("Category", selection: $categoryID) {
                    Text("All categories").tag("")
                    ForEach(model.expenseCategories) { Text($0.name).tag($0.id) }
                }.frame(width: 180)
                Picker("Payment method", selection: $paymentMethod) {
                    Text("All payment methods").tag("")
                    ForEach(["CASH", "BANK_TRANSFER", "CARD", "E_WALLET", "OTHER"], id: \.self) { Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0) }
                }.frame(width: 180)
                Button("Add Expense") { showAdd = true }.buttonStyle(iTuPrimaryButtonStyle())
            }
            HStack { Text("\(values.count) expenses").foregroundStyle(iTuTheme.inkDim); Spacer(); Text(amount(values.reduce(0) { $0 + $1.amount })).fontWeight(.semibold) }
            if values.isEmpty { Text("No expenses for this period.").foregroundStyle(iTuTheme.inkDim).frame(maxWidth: .infinity, minHeight: 160) }
            else { VStack(spacing: 0) { ForEach(values) { expenseRow($0) } }.iTuPanel(radius: 12) }
        }
        .sheet(isPresented: $showAdd) { BudgetExpenseEntryView { showAdd = false } }
        .sheet(item: $editingExpense) { expense in BudgetExpenseEntryView(expense: expense) { editingExpense = nil } }
    }

    private func expenseRow(_ expense: ExpenseModel) -> some View {
        HStack(spacing: 12) {
            Image(systemName: BudgetSupport.categorySymbol(model.expenseCategories.first { $0.id == expense.categoryId }?.icon)).foregroundStyle(BudgetSupport.categoryTint(model.expenseCategories.first { $0.id == expense.categoryId }?.color))
            VStack(alignment: .leading, spacing: 3) { Text(expense.merchant ?? expense.category).fontWeight(.medium); Text("\(expense.category) · \(expense.expenseDate)").font(.caption).foregroundStyle(iTuTheme.inkDim) }
            Spacer(); Text("−\(amount(expense.amount))").fontWeight(.semibold)
            Button { editingExpense = expense } label: { Image(systemName: "pencil") }.buttonStyle(.plain)
            Button { Task { _ = await model.deleteBudgetExpense(id: expense.id) } } label: { Image(systemName: "trash") }.buttonStyle(.plain)
        }.padding(12)
    }

    private func amount(_ value: Double) -> String { BudgetSupport.formatCurrency(value, currency: model.budgetPreferences.defaultCurrency) }
}

struct BudgetExpenseEntryView: View {
    @Environment(AppModel.self) private var model
    @State private var amount = ""
    @State private var categoryID = ""
    @State private var merchant = ""
    @State private var paymentMethod = "CASH"
    @State private var expenseDate = String(ISO8601DateFormatter().string(from: Date()).prefix(10))
    @State private var note = ""
    @State private var didLoadExpense = false
    let expense: ExpenseModel?
    let dismiss: () -> Void

    init(expense: ExpenseModel? = nil, dismiss: @escaping () -> Void) {
        self.expense = expense
        self.dismiss = dismiss
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(expense == nil ? "Add Expense" : "Edit Expense").font(.title2.bold())
            TextField("Amount", text: $amount)
            Picker("Category", selection: $categoryID) { ForEach(model.expenseCategories) { Text($0.name).tag($0.id) } }
            TextField("Date (YYYY-MM-DD)", text: $expenseDate)
            TextField("Merchant", text: $merchant)
            Picker("Payment method", selection: $paymentMethod) { ForEach(["CASH", "BANK_TRANSFER", "CARD", "E_WALLET", "OTHER"], id: \.self) { Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0) } }
            TextField("Note", text: $note)
            HStack { Spacer(); Button("Cancel", action: dismiss).buttonStyle(iTuSecondaryButtonStyle(height: 30)); Button("Save") { Task { let saved: Bool; if let expense { saved = await model.updateBudgetExpense(id: expense.id, patch: ["amount": .string(amount), "categoryId": .string(categoryID), "merchant": merchant.nilIfEmpty.map(JSONValue.string) ?? .null, "paymentMethod": .string(paymentMethod), "expenseDate": .string(expenseDate), "note": note.nilIfEmpty.map(JSONValue.string) ?? .null]) } else { saved = await model.createBudgetExpense(amount: amount, categoryID: categoryID, merchant: merchant.nilIfEmpty, paymentMethod: paymentMethod, expenseDate: expenseDate, note: note.nilIfEmpty) }; if saved { dismiss() } } }.buttonStyle(iTuPrimaryButtonStyle()) }
        }.padding(24).frame(width: 360)
        .onAppear { guard !didLoadExpense else { return }; didLoadExpense = true; if let expense { amount = String(expense.amount); categoryID = expense.categoryId; merchant = expense.merchant ?? ""; paymentMethod = expense.paymentMethod; expenseDate = String(expense.expenseDate.prefix(10)); note = expense.note ?? "" } else { categoryID = model.expenseCategories.first?.id ?? "" } }
    }
}

struct BudgetLimitsView: View {
    @Environment(AppModel.self) private var model
    let period: String
    @State private var overall = ""
    @State private var editingCategoryID: String?
    @State private var categoryLimit = ""

    var body: some View {
        let monthly = model.monthlyBudgets.first { $0.period == period }
        let summary = model.budgetSummary
        VStack(alignment: .leading, spacing: 16) {
            Text("Monthly spending limit").font(.title3.bold())
            HStack { TextField("No limit", text: $overall).textFieldStyle(.roundedBorder); Button("Save") { Task { _ = await model.updateMonthlyBudget(period: period, overallLimit: overall.nilIfEmpty) } }.buttonStyle(iTuPrimaryButtonStyle()); Button("Remove", role: .destructive) { Task { _ = await model.updateMonthlyBudget(period: period, overallLimit: nil) } }.buttonStyle(.plain) }
            if let summary { Text("Spent \(amount(summary.spent)) · Remaining \(summary.remaining.map(amount) ?? "No limit")").foregroundStyle(iTuTheme.inkDim) }
            Text("Category limits").font(.title3.bold())
            VStack(spacing: 0) {
                ForEach(model.expenseCategories) { category in
                    let row = summary?.categories.first { $0.id == category.id }
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(category.name)
                            Spacer()
                            Text(row?.limit.map(amount) ?? "No limit").foregroundStyle(iTuTheme.inkDim)
                            Button(row?.limit == nil ? "Set limit" : "Edit") {
                                editingCategoryID = category.id
                                categoryLimit = row?.limit.map { String($0) } ?? ""
                            }.buttonStyle(.plain)
                            if row?.limit != nil {
                                Button("Remove") { Task { _ = await model.deleteBudgetCategoryLimit(period: period, categoryID: category.id) } }.buttonStyle(.plain)
                            }
                        }
                        if editingCategoryID == category.id {
                            HStack {
                                TextField("Limit", text: $categoryLimit).textFieldStyle(.roundedBorder)
                                Button("Save") { Task { if await model.updateBudgetCategoryLimit(period: period, categoryID: category.id, limit: categoryLimit) { editingCategoryID = nil } } }.buttonStyle(iTuPrimaryButtonStyle())
                                Button("Cancel") { editingCategoryID = nil }.buttonStyle(.plain)
                            }
                        }
                    }.padding(12)
                }
            }.iTuPanel(radius: 12)
            if monthly == nil { Text("Set a limit to start tracking this month.").font(.caption).foregroundStyle(iTuTheme.inkDim) }
        }.onAppear { overall = monthly?.overallLimit.map { String($0) } ?? "" }
    }

    private func amount(_ value: Double) -> String { BudgetSupport.formatCurrency(value, currency: model.budgetPreferences.defaultCurrency) }
}

struct BudgetRecurringView: View {
    @Environment(AppModel.self) private var model
    @State private var showCreate = false
    @State private var editingRecurring: RecurringExpenseModel?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack { Text("Recurring expenses").font(.title3.bold()); Spacer(); Button("Add recurring expense") { showCreate = true }.buttonStyle(iTuPrimaryButtonStyle()) }
            ForEach(model.recurringExpenses.filter { $0.archivedAt == nil }) { item in
                HStack { VStack(alignment: .leading) { Text(item.name ?? item.merchant ?? item.category); Text("\(item.frequency) · due \(item.nextDueDate)").font(.caption).foregroundStyle(iTuTheme.inkDim) }; Spacer(); Text(BudgetSupport.formatCurrency(item.amount, currency: model.budgetPreferences.defaultCurrency)); Button("Edit") { editingRecurring = item }.buttonStyle(.plain); if item.nextDueDate <= String(ISO8601DateFormatter().string(from: Date()).prefix(10)) { Button("Confirm") { Task { _ = await model.confirmRecurringExpense(id: item.id) } }; Button("Skip") { Task { _ = await model.skipRecurringExpense(id: item.id) } }; }; Button("Archive") { Task { _ = await model.archiveRecurringExpense(id: item.id) } }.buttonStyle(.plain) }.padding(12)
            }
        }.iTuPanel(radius: 12)
        .sheet(isPresented: $showCreate) { BudgetRecurringEntryView { showCreate = false } }
        .sheet(item: $editingRecurring) { item in BudgetRecurringEntryView(recurring: item) { editingRecurring = nil } }
    }
}

struct BudgetRecurringEntryView: View {
    @Environment(AppModel.self) private var model
    let recurring: RecurringExpenseModel?
    let dismiss: () -> Void
    @State private var name = ""
    @State private var amount = ""
    @State private var categoryID = ""
    @State private var merchant = ""
    @State private var paymentMethod = "CASH"
    @State private var note = ""
    @State private var frequency = "MONTHLY"
    @State private var startDate = String(ISO8601DateFormatter().string(from: Date()).prefix(10))
    @State private var didLoad = false

    init(recurring: RecurringExpenseModel? = nil, dismiss: @escaping () -> Void) {
        self.recurring = recurring
        self.dismiss = dismiss
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(recurring == nil ? "Add recurring expense" : "Edit recurring expense").font(.title2.bold())
            TextField("Name (optional)", text: $name).textFieldStyle(.roundedBorder)
            TextField("Amount", text: $amount).textFieldStyle(.roundedBorder)
            Picker("Category", selection: $categoryID) { ForEach(model.expenseCategories) { Text($0.name).tag($0.id) } }
            Picker("Frequency", selection: $frequency) { Text("Weekly").tag("WEEKLY"); Text("Monthly").tag("MONTHLY"); Text("Yearly").tag("YEARLY") }
            TextField("Start date (YYYY-MM-DD)", text: $startDate).textFieldStyle(.roundedBorder)
            TextField("Merchant (optional)", text: $merchant).textFieldStyle(.roundedBorder)
            Picker("Payment method", selection: $paymentMethod) { ForEach(["CASH", "BANK_TRANSFER", "CARD", "E_WALLET", "OTHER"], id: \.self) { Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0) } }
            TextField("Note (optional)", text: $note).textFieldStyle(.roundedBorder)
            HStack { Spacer(); Button("Cancel", action: dismiss).buttonStyle(iTuSecondaryButtonStyle(height: 30)); Button("Save") { Task { let saved: Bool; if let recurring { saved = await model.updateRecurringExpense(id: recurring.id, patch: ["name": name.nilIfEmpty.map(JSONValue.string) ?? .null, "amount": .string(amount), "categoryId": .string(categoryID), "merchant": merchant.nilIfEmpty.map(JSONValue.string) ?? .null, "paymentMethod": .string(paymentMethod), "note": note.nilIfEmpty.map(JSONValue.string) ?? .null, "frequency": .string(frequency), "startDate": .string(startDate), "nextDueDate": .string(recurring.nextDueDate)]) } else { saved = await model.createRecurringExpense(name: name.nilIfEmpty, categoryID: categoryID, amount: amount, merchant: merchant.nilIfEmpty, paymentMethod: paymentMethod, note: note.nilIfEmpty, frequency: frequency, startDate: startDate) }; if saved { dismiss() } } }.buttonStyle(iTuPrimaryButtonStyle()) }
        }.padding(24).frame(width: 390)
        .onAppear { guard !didLoad else { return }; didLoad = true; if let recurring { name = recurring.name ?? ""; amount = String(recurring.amount); categoryID = recurring.categoryId; merchant = recurring.merchant ?? ""; paymentMethod = recurring.paymentMethod; note = recurring.note ?? ""; frequency = recurring.frequency; startDate = String(recurring.startDate.prefix(10)) } else { categoryID = model.expenseCategories.first?.id ?? "" } }
    }
}

struct BudgetReportsView: View {
    @Environment(AppModel.self) private var model
    let period: String
    var body: some View {
        if let report = model.budgetReport {
            VStack(alignment: .leading, spacing: 16) {
                Text("Spending over time").font(.title3.bold())
                ForEach(report.spendingOverTime) { point in HStack { Text(point.date); Spacer(); Text(BudgetSupport.formatCurrency(point.amount, currency: model.budgetPreferences.defaultCurrency)) } }
                Text("Category breakdown").font(.title3.bold())
                ForEach(report.categoryBreakdown) { row in HStack { Text(row.category); Spacer(); Text("\(row.percentage, specifier: "%.1f")%"); Text(BudgetSupport.formatCurrency(row.amount, currency: model.budgetPreferences.defaultCurrency)) } }
                Text("Monthly outflow").font(.title3.bold())
                ForEach(report.monthlyOutflow) { row in HStack { Text(row.bucket); Spacer(); Text(BudgetSupport.formatCurrency(row.amount, currency: model.budgetPreferences.defaultCurrency)) } }
                Text("Previous month").font(.title3.bold())
                HStack { Text(BudgetSupport.formatCurrency(report.previousMonthComparison.current, currency: model.budgetPreferences.defaultCurrency)); Spacer(); Text(report.previousMonthComparison.percentage.map { String(format: "%+.1f%%", $0) } ?? "—") }
                Text("Top merchants").font(.title3.bold())
                ForEach(report.topMerchants) { row in HStack { Text(row.merchant); Spacer(); Text(BudgetSupport.formatCurrency(row.amount, currency: model.budgetPreferences.defaultCurrency)) } }
                Text("Top categories").font(.title3.bold())
                ForEach(report.topCategories, id: \.category) { row in HStack { Text(row.category); Spacer(); Text(BudgetSupport.formatCurrency(row.amount, currency: model.budgetPreferences.defaultCurrency)); Text("\(row.count)").foregroundStyle(iTuTheme.inkDim) } }
            }.iTuPanel(radius: 12)
        } else { ProgressView().frame(maxWidth: .infinity, minHeight: 220) }
    }
}

struct BudgetCategoriesView: View {
    @Environment(AppModel.self) private var model
    @State private var newName = ""
    @State private var editingID: String?
    @State private var editingName = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Categories").font(.title3.bold())
            HStack { TextField("New category", text: $newName).textFieldStyle(.roundedBorder); Button("Add") { Task { if await model.createBudgetCategory(name: newName) { newName = "" } } }.buttonStyle(iTuPrimaryButtonStyle()) }
            VStack(spacing: 0) {
                ForEach(Array(model.expenseCategories.enumerated()), id: \.element.id) { index, category in
                    HStack {
                        Image(systemName: BudgetSupport.categorySymbol(category.icon))
                        if editingID == category.id {
                            TextField("Category name", text: $editingName).textFieldStyle(.roundedBorder)
                            Button("Save") { Task { if await model.updateBudgetCategory(id: category.id, name: editingName) { editingID = nil } } }.buttonStyle(.plain)
                            Button("Cancel") { editingID = nil }.buttonStyle(.plain)
                        } else {
                            Text(category.name)
                            Spacer()
                            Button("Edit") { editingID = category.id; editingName = category.name }.buttonStyle(.plain)
                        }
                        if editingID != category.id {
                            Button { move(index, by: -1) } label: { Image(systemName: "chevron.up") }.buttonStyle(.plain).disabled(index == 0)
                            Button { move(index, by: 1) } label: { Image(systemName: "chevron.down") }.buttonStyle(.plain).disabled(index == model.expenseCategories.count - 1)
                            Button("Archive") { Task { _ = await model.archiveBudgetCategory(id: category.id) } }.buttonStyle(.plain)
                        }
                    }.padding(12)
                }
            }.iTuPanel(radius: 12)
        }
    }

    private func move(_ index: Int, by offset: Int) {
        var ids = model.expenseCategories.map(\.id)
        let target = index + offset
        guard ids.indices.contains(target) else { return }
        ids.swapAt(index, target)
        Task { _ = await model.reorderBudgetCategories(ids) }
    }
}

private extension Optional where Wrapped == String {
    var nilIfEmpty: String? { flatMap { $0.isEmpty ? nil : $0 } }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
