import SwiftUI

struct BudgetView: View {
    @Environment(AppModel.self) private var model
    @SceneStorage("budget.selectedTab") private var selectedTab = "Overview"
    @SceneStorage("budget.selectedPeriod") private var selectedPeriod = BudgetView.currentPeriod
    @State private var newCategoryName = ""
    @State private var newCategoryType = "EXPENSE"
    @State private var newCategoryIcon = "wallet"
    @State private var newCategoryColor = "TEAL"
    @State private var editingCategoryID: String?
    @State private var editingCategoryName = ""
    @State private var editingCategoryType = "EXPENSE"
    @State private var editingCategoryIcon = "wallet"
    @State private var editingCategoryColor = "TEAL"
    @State private var isSavingCategory = false
    @State private var categoryError: String?
    @State private var newTransactionAmount = ""
    @State private var newTransactionType = "EXPENSE"
    @State private var newTransactionPaymentMethod = "CASH"
    @State private var newTransactionMerchant = ""
    @State private var newTransactionCategoryID = ""
    @State private var newTransactionDate = Date()
    @State private var newTransactionNote = ""
    @State private var showAddTransaction = false
    @State private var isSavingTransaction = false
    @State private var transactionError: String?
    @State private var budgetTarget = ""
    @SceneStorage("budget.transactionTypeFilter") private var transactionTypeFilter = ""
    @SceneStorage("budget.transactionCategoryFilter") private var transactionCategoryFilter = ""
    @State private var categoryLimitDrafts: [String: String] = [:]
    @State private var editingTransactionID: String?
    @State private var editingTransactionType = "EXPENSE"
    @State private var editingTransactionAmount = ""
    @State private var editingTransactionCategoryID = ""
    @State private var editingTransactionPaymentMethod = "CASH"
    @State private var editingTransactionMerchant = ""
    @State private var editingTransactionDate = Date()
    @State private var editingTransactionNote = ""
    @State private var deleteTransactionID: String?

    var body: some View {
        HStack(spacing: 0) {
            secondaryRail

            VStack(alignment: .leading, spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        if selectedTab == "Overview" {
                            budgetOverviewSection
                        } else if selectedTab == "Transactions" {
                            transactionsSection
                        } else if selectedTab == "Categories" {
                            categoryManagementSection
                        } else {
                            budgetsSection
                        }
                    }
                    .padding(24)
                }
                .iTuPinnedHeader { pageHeader }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .background(iTuTheme.canvas)
        .task {
            await loadBudgetData(force: false)
        }
        .onChange(of: transactionTypeFilter) { _, _ in Task { await loadBudgetData(force: true) } }
        .onChange(of: transactionCategoryFilter) { _, _ in Task { await loadBudgetData(force: true) } }
        .onChange(of: selectedTab) { _, tab in
            if tab == "Budgets", budgetTarget.isEmpty { budgetTarget = String(format: "%.2f", model.budgetOverview?.overallBudget ?? 0) }
        }
        .alert("Move transaction to Trash?", isPresented: Binding(get: { deleteTransactionID != nil }, set: { if !$0 { deleteTransactionID = nil } })) {
            Button("Move to Trash", role: .destructive) {
                if let id = deleteTransactionID { Task { _ = await model.deleteBudgetTransaction(id: id) } }
                deleteTransactionID = nil
            }
            Button("Cancel", role: .cancel) { deleteTransactionID = nil }
        } message: {
            Text("You can restore this transaction from Trash.")
        }
    }

    private var secondaryRail: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text("TRACKING")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.4)
                    .foregroundStyle(iTuTheme.mint)
                Text("Budget")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 22)

            Divider().overlay(iTuTheme.border)

            VStack(spacing: 4) {
                railButton("Overview", icon: "square.grid.2x2", value: "Overview")
                railButton("Transactions", icon: "receipt", value: "Transactions")
                railButton("Budgets", icon: "chart.pie", value: "Budgets")
                railButton("Categories", icon: "tag", value: "Categories")
            }
            .padding(12)

            Spacer()
        }
        .frame(width: 224)
        .background(iTuTheme.surfaceMuted)
        .overlay(alignment: .trailing) { Divider().overlay(iTuTheme.border) }
    }

    private var pageHeader: some View {
        let title: String
        let description: String
        switch selectedTab {
        case "Transactions":
            title = "Transactions"
            description = "Review and manage recorded income and expenses."
        case "Budgets":
            title = "Budgets"
            description = "Set monthly category limits and monitor progress."
        case "Categories":
            title = "Categories"
            description = "Organize the categories used by your budget."
        default:
            title = "Budget & Finances"
            description = "Track expenses, income, monthly category limits, and financial overview"
        }

        return HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 5) {
                Text("TRACKING")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.4)
                    .foregroundStyle(iTuTheme.mint)
                Text(title)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
                Text(description)
                    .font(.system(size: 13))
                    .foregroundStyle(iTuTheme.inkDim)
                if model.conflicts.contains(where: { ["moneycategory", "moneybudgetperiod", "budgettransaction"].contains($0.entityType.lowercased()) }) {
                    Label("Budget change needs conflict resolution", systemImage: "exclamationmark.triangle.fill")
                        .font(.system(size: 11, weight: .medium)).foregroundStyle(iTuTheme.amber)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 28)
        .padding(.top, 24)
        .padding(.bottom, 8)
    }

    private func railButton(_ title: String, icon: String, value: String) -> some View {
        Button { selectedTab = value } label: {
            Label(title, systemImage: icon)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
        .font(.system(size: 14, weight: selectedTab == value ? .semibold : .regular))
        .foregroundStyle(selectedTab == value ? iTuTheme.teal : iTuTheme.inkDim)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(selectedTab == value ? iTuTheme.mintTint : .clear)
        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
    }

    @ViewBuilder
    private var budgetOverviewSection: some View {
        let currency = model.budgetOverview?.currency ?? "VND"
        let income = model.budgetOverview?.income ?? 0
        let spent = model.budgetOverview?.spent ?? 0
        let assigned = model.budgetOverview?.categories.reduce(0) { $0 + $1.budget } ?? 0
        let available = model.budgetOverview?.categories.reduce(0) { $0 + $1.remaining } ?? 0
        let readyToAssign = income - assigned
        let overspentCount = model.budgetOverview?.categories.filter { $0.spent > $0.budget }.count ?? 0

        monthToolbar

        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text("Monthly overview")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Text("Stay current with every inflow and outflow.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
            }
            Spacer()
            Button {
                selectedTab = "Transactions"
                openAddTransaction()
            } label: {
                Label("Add Transaction", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
            .tint(iTuTheme.teal)
        }

        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("READY TO ASSIGN")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(readyToAssign < 0 ? iTuTheme.coral : iTuTheme.teal)
                    Text(formatCurrency(readyToAssign, currency: currency))
                        .font(.system(size: 26, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.ink)
                    Text("Income minus category assignments")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                Spacer()
                if readyToAssign < 0 {
                    Label("Assignments exceed income", systemImage: "exclamationmark.triangle.fill")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.coral)
                }
                if overspentCount > 0 {
                    Label("\(overspentCount) categories overspent", systemImage: "exclamationmark.circle.fill")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.coral)
                }
            }
            Divider().overlay(iTuTheme.border)
            HStack(spacing: 16) {
                metricCard(title: "ASSIGNED", value: formatCurrency(assigned, currency: currency), color: iTuTheme.mint)
                metricCard(title: "ACTIVITY", value: formatCurrency(spent, currency: currency), color: iTuTheme.coral)
                metricCard(title: "AVAILABLE", value: formatCurrency(available, currency: currency), color: available < 0 ? iTuTheme.coral : iTuTheme.amber)
            }
        }
        .padding(18)
        .background(readyToAssign < 0 ? iTuTheme.coral.opacity(0.06) : iTuTheme.mintTint.opacity(0.35))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(readyToAssign < 0 ? iTuTheme.coral.opacity(0.4) : iTuTheme.teal.opacity(0.25), lineWidth: 1))

        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text("Categories")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Text("Give each category a job, then spend from its available balance.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            if let categories = model.budgetOverview?.categories, !categories.isEmpty {
                HStack {
                    Text("Category")
                    Spacer()
                    Text("Assigned")
                        .frame(width: 110, alignment: .trailing)
                    Text("Activity")
                        .frame(width: 110, alignment: .trailing)
                    Text("Available")
                        .frame(width: 110, alignment: .trailing)
                }
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(iTuTheme.inkDim)
                .textCase(.uppercase)
                VStack(spacing: 8) {
                    ForEach(categories) { stat in
                        categoryRow(
                            name: stat.category.name,
                            icon: stat.category.icon ?? stat.category.name,
                            color: stat.category.color,
                            spent: stat.spent,
                            budget: stat.budget,
                            currency: currency
                        )
                    }
                }
            } else {
                Text("Create a category to start assigning money.")
                    .font(.system(size: 13))
                    .foregroundStyle(iTuTheme.inkDim)
            }
        }
        .padding(.top, 12)
    }

    @ViewBuilder
    private var transactionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Spacer()
                Button(showAddTransaction ? "Close Add" : "Add Transaction") {
                    if showAddTransaction {
                        showAddTransaction = false
                    } else {
                        openAddTransaction()
                    }
                }
                    .buttonStyle(.borderedProminent)
                    .tint(iTuTheme.teal)
            }
            if showAddTransaction {
                transactionCreateForm
            }
            HStack(spacing: 8) {
                Picker("Filter category", selection: $transactionCategoryFilter) {
                    Text("All Categories").tag("")
                    ForEach(model.budgetCategories) {
                        Label($0.name, systemImage: categorySymbol($0.icon ?? $0.name)).tag($0.id)
                    }
                }
                .frame(width: 180)
                Picker("Filter type", selection: $transactionTypeFilter) {
                    Text("All Types").tag(""); Text("Expense").tag("EXPENSE"); Text("Income").tag("INCOME")
                }
                .frame(width: 130)
            }

            if model.budgetTransactions.isEmpty {
                Text("No recent transactions recorded.")
                    .font(.system(size: 13))
                    .foregroundStyle(iTuTheme.inkDim)
            } else {
                VStack(spacing: 8) {
                    ForEach(model.budgetTransactions) { tx in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Image(systemName: tx.type.uppercased() == "INCOME" ? "arrow.up.right" : "arrow.down.right")
                                    .foregroundStyle(tx.type.uppercased() == "INCOME" ? iTuTheme.teal : iTuTheme.coral)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(tx.merchant ?? displayCategory(for: tx))
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(iTuTheme.ink)
                                    HStack(spacing: 5) {
                                        Image(systemName: categorySymbol(categoryIcon(for: tx)))
                                            .font(.system(size: 11, weight: .medium))
                                            .foregroundStyle(categoryTint(categoryColor(for: tx)))
                                        Text(displayCategory(for: tx))
                                        Text("·")
                                        Text(formattedTransactionDate(tx.transactionAt))
                                    }
                                    .font(.system(size: 11))
                                    .foregroundStyle(iTuTheme.inkDim)
                                }
                                Spacer()
                                Text("\(tx.type.uppercased() == "INCOME" ? "+" : "−")\(formatCurrency(tx.amount, currency: tx.currency))")
                                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                                    .foregroundStyle(tx.type.uppercased() == "INCOME" ? iTuTheme.teal : iTuTheme.ink)
                                Button { beginEditingTransaction(tx) } label: { Image(systemName: "pencil") }
                                    .buttonStyle(.borderless)
                                    .foregroundStyle(iTuTheme.inkDim)
                                    .frame(width: 28, height: 28)
                                    .accessibilityLabel("Edit transaction")
                                Button { deleteTransactionID = tx.id } label: { Image(systemName: "trash") }
                                    .buttonStyle(.borderless)
                                    .foregroundStyle(iTuTheme.inkDim)
                                    .frame(width: 28, height: 28)
                                    .accessibilityLabel("Move transaction to Trash")
                            }
                            if editingTransactionID == tx.id {
                                transactionEditForm(for: tx)
                            }
                        }
                        .padding(12)
                        .iTuPanel(radius: 10)
                    }
                }
            }
        }
    }

    private var transactionCreateForm: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("New Transaction")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(iTuTheme.teal)
                    .textCase(.uppercase)
                Spacer()
                Button {
                    showAddTransaction = false
                } label: {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.borderless)
                .foregroundStyle(iTuTheme.inkDim)
                .accessibilityLabel("Close new transaction")
            }

            transactionField(label: "Type") {
                Picker("Type", selection: $newTransactionType) {
                    Text("Expense").tag("EXPENSE")
                    Text("Income").tag("INCOME")
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }

            transactionField(label: "Amount") {
                TextField("Amount (e.g. 125000.50)", text: $newTransactionAmount)
                    .textFieldStyle(.roundedBorder)
            }

            HStack(alignment: .top, spacing: 12) {
                transactionField(label: "Category") {
                    Picker("Category", selection: $newTransactionCategoryID) {
                        Label("Select category", systemImage: "tag").tag("")
                        ForEach(model.budgetCategories) { category in
                            Label(category.name, systemImage: categorySymbol(category.icon ?? category.name)).tag(category.id)
                        }
                    }
                    .labelsHidden()
                    .frame(maxWidth: .infinity)
                }
                transactionField(label: "Payment Method") {
                    Picker("Payment Method", selection: $newTransactionPaymentMethod) { paymentMethodOptions }
                        .labelsHidden()
                        .frame(maxWidth: .infinity)
                }
            }

            HStack(alignment: .top, spacing: 12) {
                transactionField(label: "Merchant / Description") {
                    TextField("e.g. Supermarket", text: $newTransactionMerchant)
                        .textFieldStyle(.roundedBorder)
                }
                transactionField(label: "Date / Time") {
                    DatePicker("Date / Time", selection: $newTransactionDate, displayedComponents: [.date, .hourAndMinute])
                        .labelsHidden()
                        .datePickerStyle(.field)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            transactionField(label: "Note (Optional)") {
                TextField("Add note...", text: $newTransactionNote)
                    .textFieldStyle(.roundedBorder)
            }

            if let transactionError {
                Text(transactionError)
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.coral)
            }

            Button(isSavingTransaction ? "Saving…" : "Save Transaction") { addTransaction() }
                .buttonStyle(.borderedProminent)
                .tint(iTuTheme.teal)
                .frame(maxWidth: .infinity)
                .disabled(isSavingTransaction || !isValidAmount(newTransactionAmount) || newTransactionCategoryID.isEmpty)
        }
        .padding(16)
        .iTuPanel(radius: 14)
    }

    private func transactionField<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(iTuTheme.inkDim)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func transactionEditForm(for transaction: BudgetTransactionModel) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Picker("Type", selection: $editingTransactionType) {
                    Text("Expense").tag("EXPENSE")
                    Text("Income").tag("INCOME")
                }
                .frame(width: 130)
                TextField("Amount", text: $editingTransactionAmount)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 180)
                Picker("Category", selection: $editingTransactionCategoryID) {
                    ForEach(model.budgetCategories) { category in
                        Label(category.name, systemImage: categorySymbol(category.icon ?? category.name)).tag(category.id)
                    }
                }
                .frame(maxWidth: 220)
                Picker("Payment", selection: $editingTransactionPaymentMethod) { paymentMethodOptions }
                    .frame(width: 150)
            }
            HStack(spacing: 10) {
                TextField("Merchant / Description", text: $editingTransactionMerchant)
                    .textFieldStyle(.roundedBorder)
                DatePicker("Date", selection: $editingTransactionDate, displayedComponents: [.date, .hourAndMinute])
                    .labelsHidden()
                    .frame(width: 210)
                TextField("Note", text: $editingTransactionNote)
                    .textFieldStyle(.roundedBorder)
            }
            HStack {
                Spacer()
                Button("Cancel") { editingTransactionID = nil }.buttonStyle(.bordered)
                Button("Save Changes") { saveTransaction(transaction.id) }
                    .buttonStyle(.borderedProminent)
                    .tint(iTuTheme.teal)
                    .disabled(!isValidAmount(editingTransactionAmount) || editingTransactionCategoryID.isEmpty)
            }
        }
        .padding(.top, 4)
    }

    @ViewBuilder
    private var paymentMethodOptions: some View {
        Text("Cash").tag("CASH")
        Text("Bank transfer").tag("BANK_TRANSFER")
        Text("Card").tag("CARD")
        Text("E-wallet").tag("E_WALLET")
        Text("Other").tag("OTHER")
    }

    @ViewBuilder
    private var monthToolbar: some View {
        HStack(spacing: 8) {
            Button { moveMonth(by: -1) } label: {
                Image(systemName: "chevron.left")
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .accessibilityLabel("Previous month")
            Text(selectedPeriod)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .frame(minWidth: 72)
            Button { moveMonth(by: 1) } label: {
                Image(systemName: "chevron.right")
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .accessibilityLabel("Next month")
            Spacer()
        }
    }

    @ViewBuilder
    private var budgetsSection: some View {
        let currency = model.budgetOverview?.currency ?? "VND"
        let limit = model.budgetOverview?.overallBudget ?? 0

        VStack(alignment: .leading, spacing: 12) {
            Text("Monthly Funding Target")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            Text("Optional target: \(formatCurrency(limit, currency: currency))")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
            HStack {
                TextField("Overall target", text: $budgetTarget)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 180)
                Button("Save target") { Task { _ = await model.updateBudgetPeriod(period: selectedPeriod, overallLimit: budgetTarget) } }
                    .buttonStyle(.borderedProminent)
                    .tint(iTuTheme.teal)
            }
            Divider().overlay(iTuTheme.border)
            Text("Category limits")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
            ForEach(model.budgetCategories) { category in
                let current = model.budgetOverview?.categories.first(where: { $0.category.id == category.id })?.budget ?? 0
                HStack(spacing: 10) {
                    Image(systemName: categorySymbol(category.icon ?? category.name))
                        .foregroundStyle(categoryTint(category.color))
                        .frame(width: 24)
                    Text(category.name)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Text("Assigned \(formatCurrency(current, currency: currency))")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                    TextField("Limit", text: Binding(get: {
                        categoryLimitDrafts[category.id] ?? String(format: "%.2f", current)
                    }, set: { categoryLimitDrafts[category.id] = $0 }))
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 130)
                    Button("Save") {
                        Task { _ = await model.updateBudgetCategoryLimit(period: selectedPeriod, categoryID: category.id, limit: categoryLimitDrafts[category.id] ?? String(format: "%.2f", current)) }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                .padding(.vertical, 5)
            }
        }
        .onAppear { budgetTarget = String(format: "%.2f", limit) }
    }

    @ViewBuilder
    private var categoryManagementSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Category Management")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Text("Give each category a recognizable icon and color.")
                    .font(.system(size: 13))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    TextField("New category", text: $newCategoryName)
                        .textFieldStyle(.roundedBorder)
                    Picker("Type", selection: $newCategoryType) {
                        Text("Expense").tag("EXPENSE")
                        Text("Income").tag("INCOME")
                    }
                    .frame(width: 120)
                    Button("Add Category") { addCategory() }
                        .buttonStyle(.borderedProminent)
                        .tint(iTuTheme.teal)
                        .disabled(newCategoryName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSavingCategory)
                }

                categoryOptionPicker(title: "Icon", selection: $newCategoryIcon)
                categoryColorPicker(selection: $newCategoryColor)
            }
            .padding(16)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))

            if let categoryError {
                Text(categoryError)
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.coral)
            }

            VStack(spacing: 8) {
                ForEach(model.budgetCategories) { category in
                    categoryManagementRow(category)
                }
            }
        }
    }

    @ViewBuilder
    private func categoryManagementRow(_ category: BudgetCategoryModel) -> some View {
        if editingCategoryID == category.id {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    TextField("Category name", text: $editingCategoryName)
                        .textFieldStyle(.roundedBorder)
                    Picker("Type", selection: $editingCategoryType) {
                        Text("Expense").tag("EXPENSE")
                        Text("Income").tag("INCOME")
                    }
                    .frame(width: 120)
                    Button("Save") { saveCategory(category.id) }
                        .buttonStyle(.borderedProminent)
                        .tint(iTuTheme.teal)
                        .disabled(editingCategoryName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSavingCategory)
                    Button("Cancel") { editingCategoryID = nil }
                        .buttonStyle(.bordered)
                }
                categoryOptionPicker(title: "Icon", selection: $editingCategoryIcon)
                categoryColorPicker(selection: $editingCategoryColor)
            }
            .padding(16)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(iTuTheme.teal, lineWidth: 1))
        } else {
            HStack(spacing: 12) {
                Image(systemName: categorySymbol(category.icon ?? category.name))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(categoryTint(category.color))
                    .frame(width: 32, height: 32)
                    .background(categoryTint(category.color).opacity(0.14))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(category.name)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    Text(category.type)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                Spacer()
                Button("Edit") { beginEditing(category) }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .accessibilityLabel("Edit \(category.name)")
                Button {
                    archiveCategory(category.id)
                } label: {
                    Image(systemName: "archivebox")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityLabel("Archive \(category.name)")
            }
            .padding(12)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    private func categoryOptionPicker(title: String, selection: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(iTuTheme.inkDim)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(budgetCategoryIconOptions) { option in
                        Button {
                            selection.wrappedValue = option.key
                        } label: {
                            Image(systemName: option.symbol)
                                .frame(width: 30, height: 30)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(selection.wrappedValue == option.key ? iTuTheme.teal : iTuTheme.inkDim)
                        .background(selection.wrappedValue == option.key ? iTuTheme.mintTint : iTuTheme.canvas)
                        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(selection.wrappedValue == option.key ? iTuTheme.teal : iTuTheme.border, lineWidth: 1))
                        .accessibilityLabel(option.key)
                    }
                }
            }
        }
    }

    private func categoryColorPicker(selection: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Color")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(iTuTheme.inkDim)
            HStack(spacing: 8) {
                ForEach(budgetCategoryColorOptions) { option in
                    Button {
                        selection.wrappedValue = option.key
                    } label: {
                        Circle()
                            .fill(categoryTint(option.key))
                            .frame(width: 18, height: 18)
                            .padding(5)
                            .background(selection.wrappedValue == option.key ? iTuTheme.mintTint : .clear)
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .overlay(Circle().stroke(selection.wrappedValue == option.key ? iTuTheme.teal : .clear, lineWidth: 2))
                    .accessibilityLabel(option.label)
                }
            }
        }
    }

    private func addCategory() {
        let name = newCategoryName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        isSavingCategory = true
        categoryError = nil
        Task {
            let saved = await model.createBudgetCategory(name: name, type: newCategoryType, icon: newCategoryIcon, color: newCategoryColor)
            if saved {
                newCategoryName = ""
            } else {
                categoryError = "Could not add the category. Please try again."
            }
            isSavingCategory = false
        }
    }

    private func beginEditing(_ category: BudgetCategoryModel) {
        editingCategoryID = category.id
        editingCategoryName = category.name
        editingCategoryType = category.type
        editingCategoryIcon = category.icon ?? "wallet"
        editingCategoryColor = category.color ?? "TEAL"
        categoryError = nil
    }

    private func saveCategory(_ id: String) {
        let name = editingCategoryName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        isSavingCategory = true
        categoryError = nil
        Task {
            let saved = await model.updateBudgetCategory(id: id, name: name, type: editingCategoryType, icon: editingCategoryIcon, color: editingCategoryColor)
            if saved {
                editingCategoryID = nil
            } else {
                categoryError = "Could not update the category. Please try again."
            }
            isSavingCategory = false
        }
    }

    private func archiveCategory(_ id: String) {
        isSavingCategory = true
        categoryError = nil
        Task {
            if !(await model.archiveBudgetCategory(id: id)) {
                categoryError = "Could not archive the category. Please try again."
            }
            isSavingCategory = false
        }
    }

    private func loadBudgetData(force: Bool) async {
        await model.refreshCoordinator.run(.budget, force: force) {
            async let overview: Void = model.loadBudgetOverview(period: selectedPeriod)
            async let categories: Void = model.loadBudgetCategories()
            async let transactions: Void = model.loadBudgetTransactions(
                period: selectedPeriod,
                categoryID: transactionCategoryFilter.isEmpty ? nil : transactionCategoryFilter,
                type: transactionTypeFilter.isEmpty ? nil : transactionTypeFilter
            )
            _ = await (overview, categories, transactions)
        }
    }

    private func addTransaction() {
        guard !newTransactionCategoryID.isEmpty, isValidAmount(newTransactionAmount) else {
            transactionError = "Enter a positive amount and choose a category."
            return
        }
        let amount = newTransactionAmount
        let merchant = newTransactionMerchant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : newTransactionMerchant.trimmingCharacters(in: .whitespacesAndNewlines)
        let note = newTransactionNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : newTransactionNote.trimmingCharacters(in: .whitespacesAndNewlines)
        isSavingTransaction = true
        transactionError = nil
        Task {
            let saved = await model.createBudgetTransaction(amount: amount, categoryID: newTransactionCategoryID, type: newTransactionType, merchant: merchant, paymentMethod: newTransactionPaymentMethod, transactionAt: ISO8601DateFormatter().string(from: newTransactionDate), note: note)
            if saved {
                newTransactionAmount = ""
                newTransactionMerchant = ""
                newTransactionNote = ""
                newTransactionDate = Date()
                showAddTransaction = false
            } else {
                transactionError = "Could not save the transaction. Please try again."
            }
            isSavingTransaction = false
        }
    }

    private func openAddTransaction() {
        if !model.budgetCategories.contains(where: { $0.id == newTransactionCategoryID }) {
            newTransactionCategoryID = model.budgetCategories.first?.id ?? ""
        }
        transactionError = nil
        showAddTransaction = true
    }

    private func beginEditingTransaction(_ transaction: BudgetTransactionModel) {
        editingTransactionID = transaction.id
        editingTransactionType = transaction.type
        editingTransactionAmount = String(format: "%.2f", transaction.amount)
        editingTransactionCategoryID = transaction.categoryId ?? model.budgetCategories.first?.id ?? ""
        editingTransactionPaymentMethod = transaction.paymentMethod
        editingTransactionMerchant = transaction.merchant ?? ""
        editingTransactionDate = transactionDate(transaction.transactionAt)
        editingTransactionNote = transaction.note ?? ""
    }

    private func saveTransaction(_ id: String) {
        guard isValidAmount(editingTransactionAmount), !editingTransactionCategoryID.isEmpty else { return }
        let merchant = editingTransactionMerchant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? JSONValue.null : .string(editingTransactionMerchant.trimmingCharacters(in: .whitespacesAndNewlines))
        let note = editingTransactionNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? JSONValue.null : .string(editingTransactionNote.trimmingCharacters(in: .whitespacesAndNewlines))
        let patch: [String: JSONValue] = [
            "type": .string(editingTransactionType),
            "amount": .string(editingTransactionAmount),
            "categoryId": .string(editingTransactionCategoryID),
            "paymentMethod": .string(editingTransactionPaymentMethod),
            "merchant": merchant,
            "transactionAt": .string(ISO8601DateFormatter().string(from: editingTransactionDate)),
            "note": note
        ]
        Task {
            if await model.updateBudgetTransaction(id: id, patch: patch) { editingTransactionID = nil }
        }
    }

    private func isValidAmount(_ value: String) -> Bool {
        guard let amount = Double(value.trimmingCharacters(in: .whitespacesAndNewlines)) else { return false }
        return amount.isFinite && amount > 0
    }

    private func transactionDate(_ value: String) -> Date {
        ISO8601DateFormatter().date(from: value) ?? Date()
    }

    private func formattedTransactionDate(_ value: String) -> String {
        transactionDate(value).formatted(date: .abbreviated, time: .shortened)
    }

    private func displayCategory(for transaction: BudgetTransactionModel) -> String {
        if let categoryID = transaction.categoryId, let category = model.budgetCategories.first(where: { $0.id == categoryID }) {
            return category.name
        }
        return transaction.category
    }

    private func categoryIcon(for transaction: BudgetTransactionModel) -> String {
        if let categoryID = transaction.categoryId, let category = model.budgetCategories.first(where: { $0.id == categoryID }) {
            return category.icon ?? category.name
        }
        return transaction.category
    }

    private func categoryColor(for transaction: BudgetTransactionModel) -> String? {
        guard let categoryID = transaction.categoryId else { return nil }
        return model.budgetCategories.first(where: { $0.id == categoryID })?.color
    }

    private func moveMonth(by offset: Int) {
        let parts = selectedPeriod.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 2 else { return }
        let calendar = iTuCalendarSupport.calendar()
        let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: 1)) ?? Date()
        guard let next = calendar.date(byAdding: .month, value: offset, to: date) else { return }
        selectedPeriod = String(format: "%04d-%02d", calendar.component(.year, from: next), calendar.component(.month, from: next))
        Task { await loadBudgetData(force: true) }
    }

    private func formatCurrency(_ amount: Double, currency: String) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: amount)) ?? "\(currency) \(Int(amount))"
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

    private func categoryRow(name: String, icon: String?, color: String?, spent: Double, budget: Double, currency: String) -> some View {
        let progress = budget > 0 ? CGFloat(spent / budget) : 0
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                HStack(spacing: 7) {
                    Image(systemName: categorySymbol(icon))
                        .foregroundStyle(categoryTint(color))
                    Text(name)
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
                Spacer()
                Text("Assigned \(formatCurrency(budget, currency: currency)) · Activity \(formatCurrency(spent, currency: currency))")
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
            let available = max(0, budget - spent)
            let isOverspent = spent > budget
            Text("Available \(formatCurrency(available, currency: currency))")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(isOverspent ? iTuTheme.coral : iTuTheme.inkDim)
        }
        .padding(12)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func categorySymbol(_ icon: String?) -> String {
        let normalized = (icon ?? "other").trimmingCharacters(in: .whitespacesAndNewlines).lowercased().replacingOccurrences(of: "-", with: "_").replacingOccurrences(of: " ", with: "_")
        let key: String
        switch normalized {
        case "utensils": key = "food"
        case "car": key = "transport"
        case "shoppingbag", "groceries", "grocery": key = "shopping"
        case "receipt": key = "bills"
        case "heart": key = "health"
        case "tv": key = "entertainment"
        case "folder": key = "other"
        case "transportation": key = "transport"
        default: key = normalized
        }
        switch key {
        case "wallet": return "wallet.pass.fill"
        case "home": return "house.fill"
        case "food": return "fork.knife"
        case "coffee": return "cup.and.saucer.fill"
        case "shopping": return "bag.fill"
        case "transport": return "car.fill"
        case "bills": return "receipt.fill"
        case "health": return "heart.fill"
        case "fitness": return "dumbbell.fill"
        case "education": return "graduationcap.fill"
        case "entertainment": return "party.popper.fill"
        case "travel": return "airplane"
        case "work": return "briefcase.fill"
        case "gifts": return "gift.fill"
        case "other": return "ellipsis.circle.fill"
        default: return "wallet.pass.fill"
        }
    }

    private func categoryTint(_ color: String?) -> Color {
        switch color?.uppercased() {
        case "EMERALD": return .green
        case "BLUE", "INDIGO": return iTuTheme.syncBlue
        case "VIOLET": return .purple
        case "AMBER": return iTuTheme.amber
        case "ROSE": return .pink
        case "SLATE": return iTuTheme.inkDim
        default: return iTuTheme.teal
        }
    }

    private static var currentPeriod: String {
        let calendar = iTuCalendarSupport.calendar()
        let now = Date()
        return iTuCalendarSupport.monthString(now)
    }
}

private struct BudgetCategoryIconOption: Identifiable {
    let key: String
    let symbol: String
    var id: String { key }
}

private struct BudgetCategoryColorOption: Identifiable {
    let key: String
    let label: String
    var id: String { key }
}

private let budgetCategoryIconOptions = [
    BudgetCategoryIconOption(key: "wallet", symbol: "wallet.pass.fill"),
    BudgetCategoryIconOption(key: "home", symbol: "house.fill"),
    BudgetCategoryIconOption(key: "food", symbol: "fork.knife"),
    BudgetCategoryIconOption(key: "coffee", symbol: "cup.and.saucer.fill"),
    BudgetCategoryIconOption(key: "shopping", symbol: "bag.fill"),
    BudgetCategoryIconOption(key: "transport", symbol: "car.fill"),
    BudgetCategoryIconOption(key: "bills", symbol: "receipt.fill"),
    BudgetCategoryIconOption(key: "health", symbol: "heart.fill"),
    BudgetCategoryIconOption(key: "fitness", symbol: "dumbbell.fill"),
    BudgetCategoryIconOption(key: "education", symbol: "graduationcap.fill"),
    BudgetCategoryIconOption(key: "entertainment", symbol: "party.popper.fill"),
    BudgetCategoryIconOption(key: "travel", symbol: "airplane"),
    BudgetCategoryIconOption(key: "work", symbol: "briefcase.fill"),
    BudgetCategoryIconOption(key: "gifts", symbol: "gift.fill"),
    BudgetCategoryIconOption(key: "other", symbol: "ellipsis.circle.fill")
]

private let budgetCategoryColorOptions = [
    BudgetCategoryColorOption(key: "TEAL", label: "Teal"),
    BudgetCategoryColorOption(key: "EMERALD", label: "Emerald"),
    BudgetCategoryColorOption(key: "BLUE", label: "Blue"),
    BudgetCategoryColorOption(key: "VIOLET", label: "Violet"),
    BudgetCategoryColorOption(key: "AMBER", label: "Amber"),
    BudgetCategoryColorOption(key: "ROSE", label: "Rose"),
    BudgetCategoryColorOption(key: "INDIGO", label: "Indigo"),
    BudgetCategoryColorOption(key: "SLATE", label: "Slate")
]
