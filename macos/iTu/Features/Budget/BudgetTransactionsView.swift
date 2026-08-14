import SwiftUI

struct BudgetTransactionsView: View {
    @Environment(AppModel.self) private var model
    @Binding var typeFilter: String
    @Binding var categoryFilter: String
    var onAddTransactionClicked: () -> Void

    @State private var editingTransactionID: String?
    @State private var editingType = "EXPENSE"
    @State private var editingAmount = ""
    @State private var editingCategoryID = ""
    @State private var editingPaymentMethod = "CASH"
    @State private var editingMerchant = ""
    @State private var editingDate = Date()
    @State private var editingNote = ""
    @State private var deleteTransactionID: String?
    @State private var isUpdating = false

    private var currency: String {
        model.budgetPreferences.defaultCurrency
    }

    private var activeCategories: [BudgetCategoryModel] {
        model.budgetCategories.filter { $0.archivedAt == nil }
    }

    private var filteredTransactions: [BudgetTransactionModel] {
        model.budgetTransactions.filter { tx in
            tx.deletedAt == nil &&
            (typeFilter.isEmpty || tx.type == typeFilter) &&
            (categoryFilter.isEmpty || tx.categoryId == categoryFilter)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Filters Bar
            HStack(spacing: 12) {
                // Type Filter
                Picker("Filter Type", selection: $typeFilter) {
                    Text("All Types").tag("")
                    Text("Expenses").tag("EXPENSE")
                    Text("Income").tag("INCOME")
                }
                .pickerStyle(.menu)
                .frame(width: 130)

                // Category Filter
                Picker("Filter Category", selection: $categoryFilter) {
                    Text("All Categories").tag("")
                    ForEach(activeCategories) { cat in
                        Text(cat.name).tag(cat.id)
                    }
                }
                .pickerStyle(.menu)
                .frame(width: 160)

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

            // Transactions Table / List
            if filteredTransactions.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "creditcard")
                        .font(.system(size: 28))
                        .foregroundStyle(iTuTheme.inkDim)
                    Text("No transactions found.")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)
                    Text("Add your first income or expense to start tracking.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                .frame(maxWidth: .infinity, minHeight: 140)
                .background(iTuTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                LazyVStack(spacing: 8) {
                    ForEach(filteredTransactions) { tx in
                        if editingTransactionID == tx.id {
                            editTransactionCard(tx)
                        } else {
                            transactionRow(tx)
                        }
                    }
                }
            }
        }
        .alert("Move transaction to Trash?", isPresented: Binding(get: { deleteTransactionID != nil }, set: { if !$0 { deleteTransactionID = nil } })) {
            Button("Move to Trash", role: .destructive) {
                if let id = deleteTransactionID {
                    Task { _ = await model.deleteBudgetTransaction(id: id) }
                }
                deleteTransactionID = nil
            }
            Button("Cancel", role: .cancel) { deleteTransactionID = nil }
        } message: {
            Text("You can restore this transaction from Trash.")
        }
    }

    private func transactionRow(_ tx: BudgetTransactionModel) -> some View {
        let isIncome = tx.type == "INCOME"
        let cat = model.budgetCategories.first { $0.id == tx.categoryId }

        return HStack(spacing: 12) {
            // Type Icon
            Circle()
                .fill(isIncome ? iTuTheme.mint.opacity(0.15) : iTuTheme.coral.opacity(0.15))
                .frame(width: 32, height: 32)
                .overlay {
                    Image(systemName: isIncome ? "arrow.down.left" : "arrow.up.right")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(isIncome ? iTuTheme.mint : iTuTheme.coral)
                }

            // Description & Category
            VStack(alignment: .leading, spacing: 2) {
                Text(tx.merchant ?? (isIncome ? "Income" : "Expense"))
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)

                HStack(spacing: 6) {
                    if let cat {
                        HStack(spacing: 4) {
                            Image(systemName: BudgetSupport.categorySymbol(cat.icon))
                            Text(cat.name)
                        }
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(BudgetSupport.categoryTint(cat.color))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(BudgetSupport.categoryTint(cat.color).opacity(0.1))
                        .clipShape(Capsule())
                    }
                    Text("· \(tx.paymentMethod.capitalized.replacingOccurrences(of: "_", with: " "))")
                        .font(.system(size: 10))
                        .foregroundStyle(iTuTheme.inkDim)
                    if let note = tx.note, !note.isEmpty {
                        Text("· \(note)")
                            .font(.system(size: 10))
                            .foregroundStyle(iTuTheme.inkDim)
                            .lineLimit(1)
                    }
                }
            }

            Spacer()

            // Date & Amount
            VStack(alignment: .trailing, spacing: 2) {
                Text((isIncome ? "+ " : "- ") + BudgetSupport.formatCurrency(tx.amount, currency: tx.currency.isEmpty ? currency : tx.currency))
                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                    .foregroundStyle(isIncome ? iTuTheme.mint : iTuTheme.coral)
                Text(String(tx.transactionAt.prefix(10)))
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            // Actions
            HStack(spacing: 4) {
                Button {
                    startEditing(tx)
                } label: {
                    Image(systemName: "pencil")
                }
                .buttonStyle(.borderless)
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.inkDim)
                .accessibilityLabel("Edit transaction")

                Button {
                    deleteTransactionID = tx.id
                } label: {
                    Image(systemName: "trash")
                }
                .buttonStyle(.borderless)
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.coral)
                .accessibilityLabel("Delete transaction")
            }
            .padding(.leading, 6)
        }
        .padding(12)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }

    private func editTransactionCard(_ tx: BudgetTransactionModel) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Edit Transaction")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Button("Cancel") { editingTransactionID = nil }
                    .buttonStyle(.plain)
                    .font(.system(size: 11))
            }

            HStack(spacing: 10) {
                Picker("Type", selection: $editingType) {
                    Text("Expense").tag("EXPENSE")
                    Text("Income").tag("INCOME")
                }
                .pickerStyle(.segmented)
                .frame(width: 140)

                TextField("Amount", text: $editingAmount)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 100)

                TextField("Merchant", text: $editingMerchant)
                    .textFieldStyle(.roundedBorder)

                Picker("Category", selection: $editingCategoryID) {
                    Text("Uncategorized").tag("")
                    ForEach(activeCategories.filter { $0.type == editingType }) { cat in
                        Text(cat.name).tag(cat.id)
                    }
                }
                .pickerStyle(.menu)
                .frame(width: 130)

                Button(isUpdating ? "Saving…" : "Save") {
                    updateTransaction(tx)
                }
                .buttonStyle(.borderedProminent)
                .tint(iTuTheme.teal)
                .controlSize(.small)
                .disabled(editingAmount.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isUpdating)
            }
        }
        .padding(12)
        .background(iTuTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.teal.opacity(0.5), lineWidth: 1)
        }
    }

    private func startEditing(_ tx: BudgetTransactionModel) {
        editingTransactionID = tx.id
        editingType = tx.type
        editingAmount = String(format: "%.2f", tx.amount)
        editingCategoryID = tx.categoryId ?? ""
        editingPaymentMethod = tx.paymentMethod
        editingMerchant = tx.merchant ?? ""
        editingNote = tx.note ?? ""
    }

    private func updateTransaction(_ tx: BudgetTransactionModel) {
        guard let numAmount = Double(editingAmount.replacingOccurrences(of: ",", with: ".")), numAmount > 0 else { return }
        isUpdating = true
        var patch: [String: JSONValue] = [
            "type": .string(editingType),
            "amount": .string(String(format: "%.2f", numAmount)),
            "paymentMethod": .string(editingPaymentMethod)
        ]
        if !editingCategoryID.isEmpty {
            patch["categoryId"] = .string(editingCategoryID)
        }
        let trimmedMerchant = editingMerchant.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedMerchant.isEmpty {
            patch["merchant"] = .string(trimmedMerchant)
        }
        let trimmedNote = editingNote.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedNote.isEmpty {
            patch["note"] = .string(trimmedNote)
        }
        Task {
            _ = await model.updateBudgetTransaction(id: tx.id, patch: patch)
            isUpdating = false
            editingTransactionID = nil
        }
    }
}

