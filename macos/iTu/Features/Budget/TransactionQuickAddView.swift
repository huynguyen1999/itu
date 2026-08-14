import SwiftUI

struct TransactionQuickAddView: View {
    @Environment(AppModel.self) private var model
    var onSaved: () -> Void

    @State private var type = "EXPENSE"
    @State private var amount = ""
    @State private var categoryID = ""
    @State private var paymentMethod = "CASH"
    @State private var merchant = ""
    @State private var date = Date()
    @State private var note = ""
    @State private var isSaving = false
    @State private var errorText: String?
    @State private var categorySearch = ""
    @State private var isCategoryPickerExpanded = false

    private var availableCategories: [BudgetCategoryModel] {
        model.budgetCategories.filter { cat in
            cat.archivedAt == nil && cat.type == type &&
            (categorySearch.isEmpty || cat.name.localizedCaseInsensitiveContains(categorySearch))
        }
    }

    private var selectedCategory: BudgetCategoryModel? {
        model.budgetCategories.first { $0.id == categoryID }
    }

    private var paymentMethods: [(key: String, label: String)] {
        [
            ("CASH", "Cash"),
            ("BANK_TRANSFER", "Bank Transfer"),
            ("CARD", "Card"),
            ("E_WALLET", "E-Wallet"),
            ("OTHER", "Other")
        ]
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Log Transaction")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Picker("Type", selection: $type) {
                    Text("Expense").tag("EXPENSE")
                    Text("Income").tag("INCOME")
                }
                .pickerStyle(.segmented)
                .frame(width: 160)
                .onChange(of: type) { _, _ in
                    categoryID = ""
                    categorySearch = ""
                }
            }

            HStack(spacing: 12) {
                // Amount Input
                VStack(alignment: .leading, spacing: 4) {
                    Text("AMOUNT (\(model.budgetPreferences.defaultCurrency))")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                    TextField("0.00", text: $amount)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 14, weight: .bold, design: .monospaced))
                }
                .frame(width: 140)

                // Category Searchable Combobox
                VStack(alignment: .leading, spacing: 4) {
                    Text("CATEGORY")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)

                    Menu {
                        TextField("Search categories…", text: $categorySearch)
                        Divider()
                        ForEach(availableCategories) { cat in
                            Button {
                                categoryID = cat.id
                                categorySearch = ""
                            } label: {
                                Label {
                                    Text(cat.name)
                                } icon: {
                                    Image(systemName: BudgetSupport.categorySymbol(cat.icon))
                                }
                            }
                        }
                    } label: {
                        HStack(spacing: 6) {
                            if let cat = selectedCategory {
                                Image(systemName: BudgetSupport.categorySymbol(cat.icon))
                                    .foregroundStyle(BudgetSupport.categoryTint(cat.color))
                                Text(cat.name)
                                    .foregroundStyle(iTuTheme.ink)
                            } else {
                                Text("Select category…")
                                    .foregroundStyle(iTuTheme.inkDim)
                            }
                            Spacer()
                            Image(systemName: "chevron.up.chevron.down")
                                .font(.system(size: 9))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(iTuTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .stroke(iTuTheme.border, lineWidth: 1)
                        }
                    }
                    .menuStyle(.borderlessButton)
                }

                // Payment Method
                VStack(alignment: .leading, spacing: 4) {
                    Text("PAYMENT METHOD")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                    Picker("Payment Method", selection: $paymentMethod) {
                        ForEach(paymentMethods, id: \.key) { method in
                            Text(method.label).tag(method.key)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                }
                .frame(width: 140)
            }

            HStack(spacing: 12) {
                // Merchant / Payee
                VStack(alignment: .leading, spacing: 4) {
                    Text("MERCHANT / PAYEE")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                    TextField("Store, Restaurant, Client…", text: $merchant)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 12))
                }

                // Date Picker
                VStack(alignment: .leading, spacing: 4) {
                    Text("DATE")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                    DatePicker("", selection: $date, displayedComponents: [.date])
                        .labelsHidden()
                        .datePickerStyle(.compact)
                }
                .frame(width: 120)

                // Note
                VStack(alignment: .leading, spacing: 4) {
                    Text("NOTE (OPTIONAL)")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                    TextField("Details…", text: $note)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 12))
                }

                // Save Action
                VStack {
                    Spacer()
                    Button(isSaving ? "Saving…" : "Add Transaction") {
                        saveTransaction()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(iTuTheme.teal)
                    .controlSize(.regular)
                    .disabled(amount.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }

            if let errorText {
                Text(errorText)
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.coral)
            }
        }
        .padding(16)
        .background(iTuTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }

    private func saveTransaction() {
        let trimmedAmount = amount.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let numAmount = Double(trimmedAmount.replacingOccurrences(of: ",", with: ".")), numAmount > 0 else {
            errorText = "Enter a valid positive amount."
            return
        }
        guard !categoryID.isEmpty else {
            errorText = "Please select a category."
            return
        }
        isSaving = true
        errorText = nil
        Task {
            let success = await model.createBudgetTransaction(
                amount: String(format: "%.2f", numAmount),
                categoryID: categoryID,
                type: type,
                merchant: merchant.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : merchant.trimmingCharacters(in: .whitespacesAndNewlines),
                paymentMethod: paymentMethod,
                transactionAt: ISO8601DateFormatter().string(from: date),
                note: note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : note.trimmingCharacters(in: .whitespacesAndNewlines)
            )
            isSaving = false
            if success {
                amount = ""
                merchant = ""
                note = ""
                onSaved()
            } else {
                errorText = "Failed to save transaction."
            }
        }
    }

}
