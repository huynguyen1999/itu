import SwiftUI

struct BudgetView: View {
    @Environment(AppModel.self) private var model
    @State private var selectedTab = "Overview"
    @State private var selectedPeriod = BudgetView.currentPeriod
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

    var body: some View {
        HStack(spacing: 0) {
            secondaryRail

            VStack(alignment: .leading, spacing: 0) {
                pageHeader

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        if selectedTab == "Overview" {
                            budgetOverviewSection
                        } else if selectedTab == "Transactions" {
                            transactionsSection
                        } else if selectedTab == "Calendar" {
                            calendarSection
                        } else if selectedTab == "Categories" {
                            categoryManagementSection
                        } else {
                            budgetsSection
                        }
                    }
                    .padding(24)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .background(iTuTheme.canvas)
        .task {
            await loadBudgetData()
            await model.loadBudgetCategories()
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
                railButton("Calendar", icon: "calendar", value: "Calendar")
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
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 5) {
                Text("TRACKING")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.4)
                    .foregroundStyle(iTuTheme.mint)
                Text("Budget & Finances")
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
                Text("Track expenses, income, assignments, and available balances")
                    .font(.system(size: 13))
                    .foregroundStyle(iTuTheme.inkDim)
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

        monthToolbar

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
                Text("Transactions")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Button("Add Transaction") {}
                    .buttonStyle(.borderedProminent)
                    .tint(iTuTheme.teal)
                    .disabled(true)
                    .help("Adding transactions is not supported on macOS yet")
            }
            Text("Adding transactions is not supported on macOS yet.")
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.inkDim)

            if model.budgetTransactions.isEmpty {
                Text("No recent transactions recorded.")
                    .font(.system(size: 13))
                    .foregroundStyle(iTuTheme.inkDim)
            } else {
                VStack(spacing: 8) {
                    ForEach(model.budgetTransactions) { tx in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(tx.merchant ?? tx.category)
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(iTuTheme.ink)
                                Text(tx.category)
                                    .font(.system(size: 11))
                                    .foregroundStyle(iTuTheme.inkDim)
                            }
                            Spacer()
                            Text(formatCurrency(tx.amount, currency: tx.currency))
                                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                                .foregroundStyle(tx.type.uppercased() == "INCOME" ? iTuTheme.teal : iTuTheme.coral)
                        }
                        .padding(12)
                        .background(iTuTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                }
            }
        }
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
    private var calendarSection: some View {
        monthToolbar
        let calendar = Calendar.current
        let components = selectedPeriod.split(separator: "-").compactMap { Int($0) }
        let year = components.first ?? calendar.component(.year, from: Date())
        let month = components.dropFirst().first ?? calendar.component(.month, from: Date())
        let start = calendar.date(from: DateComponents(year: year, month: month, day: 1)) ?? Date()
        let days = calendar.range(of: .day, in: .month, for: start)?.count ?? 0
        let firstWeekday = calendar.component(.weekday, from: start) - 1
        let columns = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

        VStack(alignment: .leading, spacing: 12) {
            Text("Budget Calendar")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(iTuTheme.ink)
            LazyVGrid(columns: columns, spacing: 6) {
                ForEach(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], id: \.self) { day in
                    Text(day)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(iTuTheme.inkDim)
                        .frame(maxWidth: .infinity)
                }
                ForEach(0..<firstWeekday, id: \.self) { index in
                    Color.clear.frame(height: 76).id("empty-\(index)")
                }
                ForEach(1...max(days, 1), id: \.self) { day in
                    calendarDayCell(day: day, year: year, month: month)
                }
            }
            .padding(12)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))
        }
    }

    private func calendarDayCell(day: Int, year: Int, month: Int) -> some View {
        let transactions = model.budgetTransactions.filter { transactionDay($0.transactionAt) == day && transactionMonth($0.transactionAt) == String(format: "%04d-%02d", year, month) }
        let spent = transactions.filter { $0.type.uppercased() != "INCOME" }.reduce(0) { $0 + $1.amount }
        let income = transactions.filter { $0.type.uppercased() == "INCOME" }.reduce(0) { $0 + $1.amount }
        return VStack(alignment: .leading, spacing: 2) {
            Text("\(day)")
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundStyle(iTuTheme.ink)
            Spacer(minLength: 0)
            if spent > 0 {
                Text("-\(compactCurrency(spent))")
                    .foregroundStyle(iTuTheme.coral)
            }
            if income > 0 {
                Text("+\(compactCurrency(income))")
                    .foregroundStyle(iTuTheme.teal)
            }
        }
        .font(.system(size: 10, weight: .bold, design: .monospaced))
        .frame(maxWidth: .infinity, minHeight: 76, alignment: .topLeading)
        .padding(7)
        .background(iTuTheme.canvas)
        .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(iTuTheme.border.opacity(0.6), lineWidth: 1))
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
        }
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

    private func loadBudgetData() async {
        await model.loadBudgetOverview(period: selectedPeriod)
        await model.loadBudgetTransactions(period: selectedPeriod)
    }

    private func moveMonth(by offset: Int) {
        let parts = selectedPeriod.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 2 else { return }
        let calendar = Calendar.current
        let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: 1)) ?? Date()
        guard let next = calendar.date(byAdding: .month, value: offset, to: date) else { return }
        selectedPeriod = String(format: "%04d-%02d", calendar.component(.year, from: next), calendar.component(.month, from: next))
        Task { await loadBudgetData() }
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
            let available = budget - spent
            Text("Available \(formatCurrency(available, currency: currency))")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(available < 0 ? iTuTheme.coral : iTuTheme.inkDim)
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

    private func compactCurrency(_ amount: Double) -> String {
        if amount >= 1_000_000 { return String(format: "%.1fM", amount / 1_000_000) }
        if amount >= 1_000 { return String(format: "%.0fk", amount / 1_000) }
        return String(Int(amount))
    }

    private func transactionMonth(_ value: String) -> String { String(value.prefix(7)) }

    private func transactionDay(_ value: String) -> Int {
        Int(value.prefix(10).split(separator: "-").last ?? "0") ?? 0
    }

    private static var currentPeriod: String {
        let calendar = Calendar.current
        let now = Date()
        return String(format: "%04d-%02d", calendar.component(.year, from: now), calendar.component(.month, from: now))
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
