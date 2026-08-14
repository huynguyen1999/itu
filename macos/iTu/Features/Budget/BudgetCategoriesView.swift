import SwiftUI

struct BudgetCategoriesView: View {
    @Environment(AppModel.self) private var model

    @State private var newName = ""
    @State private var newType = "EXPENSE"
    @State private var newIcon = "wallet"
    @State private var newColor = "TEAL"
    @State private var isCreating = false
    @State private var createError: String?

    @State private var editingCategoryID: String?
    @State private var editingName = ""
    @State private var editingType = "EXPENSE"
    @State private var editingIcon = "wallet"
    @State private var editingColor = "TEAL"
    @State private var isSavingEdit = false

    private var activeCategories: [BudgetCategoryModel] {
        model.budgetCategories.filter { $0.archivedAt == nil }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            // Create Category Form
            VStack(alignment: .leading, spacing: 14) {
                Text("CREATE NEW CATEGORY")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.teal)

                HStack(spacing: 12) {
                    TextField("Category name…", text: $newName)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 13))

                    Picker("Type", selection: $newType) {
                        Text("Expense").tag("EXPENSE")
                        Text("Income").tag("INCOME")
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 160)

                    Button(isCreating ? "Creating…" : "Add Category") {
                        createCategory()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(iTuTheme.teal)
                    .controlSize(.regular)
                    .disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isCreating)
                }

                // 8-Icon Grid Picker
                VStack(alignment: .leading, spacing: 6) {
                    Text("ICON")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)

                    HStack(spacing: 8) {
                        ForEach(budgetCategoryIconOptions) { opt in
                            Button {
                                newIcon = opt.key
                            } label: {
                                Image(systemName: opt.symbol)
                                    .font(.system(size: 14))
                                    .frame(width: 32, height: 32)
                                    .background(newIcon == opt.key ? iTuTheme.teal.opacity(0.15) : iTuTheme.surface)
                                    .foregroundStyle(newIcon == opt.key ? iTuTheme.teal : iTuTheme.inkDim)
                                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                    .overlay {
                                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                                            .stroke(newIcon == opt.key ? iTuTheme.teal : iTuTheme.border, lineWidth: newIcon == opt.key ? 1.5 : 1)
                                    }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(opt.label)
                        }
                    }
                }

                // 8-Color Palette Picker
                VStack(alignment: .leading, spacing: 6) {
                    Text("COLOR")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)

                    HStack(spacing: 8) {
                        ForEach(budgetCategoryColorOptions) { opt in
                            Button {
                                newColor = opt.key
                            } label: {
                                Circle()
                                    .fill(opt.color)
                                    .frame(width: 22, height: 22)
                                    .overlay {
                                        if newColor == opt.key {
                                            Image(systemName: "checkmark")
                                                .font(.system(size: 10, weight: .bold))
                                                .foregroundStyle(.white)
                                        }
                                    }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(opt.label)
                        }
                    }
                }

                if let createError {
                    Text(createError)
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.coral)
                }
            }
            .padding(16)
            .background(iTuTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(iTuTheme.border, lineWidth: 1)
            }

            // Categories List
            VStack(alignment: .leading, spacing: 12) {
                Text("ACTIVE CATEGORIES (\(activeCategories.count))")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                if activeCategories.isEmpty {
                    Text("No categories yet. Create your first category above.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    LazyVStack(spacing: 8) {
                        ForEach(activeCategories) { cat in
                            if editingCategoryID == cat.id {
                                editCategoryRow(cat)
                            } else {
                                categoryRow(cat)
                            }
                        }
                    }
                }
            }
        }
    }

    private func categoryRow(_ cat: BudgetCategoryModel) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(BudgetSupport.categoryTint(cat.color).opacity(0.15))
                .frame(width: 32, height: 32)
                .overlay {
                    Image(systemName: BudgetSupport.categorySymbol(cat.icon))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(BudgetSupport.categoryTint(cat.color))
                }

            VStack(alignment: .leading, spacing: 2) {
                Text(cat.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                Text(cat.type == "EXPENSE" ? "Expense category" : "Income category")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            Spacer()

            Button {
                startEditing(cat)
            } label: {
                Image(systemName: "pencil")
            }
            .buttonStyle(.borderless)
            .font(.system(size: 12))
            .foregroundStyle(iTuTheme.inkDim)
            .accessibilityLabel("Edit \(cat.name)")

            Button {
                archiveCategory(cat.id)
            } label: {
                Image(systemName: "archivebox")
            }
            .buttonStyle(.borderless)
            .font(.system(size: 12))
            .foregroundStyle(iTuTheme.inkDim)
            .accessibilityLabel("Archive \(cat.name)")
        }
        .padding(12)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }

    private func editCategoryRow(_ cat: BudgetCategoryModel) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Edit Category")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Button("Cancel") { editingCategoryID = nil }
                    .buttonStyle(.plain)
                    .font(.system(size: 11))
            }

            HStack(spacing: 10) {
                TextField("Category name", text: $editingName)
                    .textFieldStyle(.roundedBorder)

                Picker("Type", selection: $editingType) {
                    Text("Expense").tag("EXPENSE")
                    Text("Income").tag("INCOME")
                }
                .pickerStyle(.segmented)
                .frame(width: 140)

                Button(isSavingEdit ? "Saving…" : "Save") {
                    saveEdit(cat)
                }
                .buttonStyle(.borderedProminent)
                .tint(iTuTheme.teal)
                .controlSize(.small)
                .disabled(editingName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSavingEdit)
            }

            // Quick icon/color in edit
            HStack(spacing: 8) {
                ForEach(budgetCategoryIconOptions.prefix(6)) { opt in
                    Button {
                        editingIcon = opt.key
                    } label: {
                        Image(systemName: opt.symbol)
                            .font(.system(size: 12))
                            .frame(width: 26, height: 26)
                            .background(editingIcon == opt.key ? iTuTheme.teal.opacity(0.15) : iTuTheme.surface)
                            .foregroundStyle(editingIcon == opt.key ? iTuTheme.teal : iTuTheme.inkDim)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }

                Spacer()

                ForEach(budgetCategoryColorOptions.prefix(6)) { opt in
                    Button {
                        editingColor = opt.key
                    } label: {
                        Circle()
                            .fill(opt.color)
                            .frame(width: 18, height: 18)
                            .overlay {
                                if editingColor == opt.key {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 8, weight: .bold))
                                        .foregroundStyle(.white)
                                }
                            }
                    }
                    .buttonStyle(.plain)
                }
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

    private func createCategory() {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isCreating = true
        createError = nil
        Task {
            let success = await model.createBudgetCategory(
                name: trimmed,
                type: newType,
                icon: newIcon,
                color: newColor
            )
            isCreating = false
            if success {
                newName = ""
            } else {
                createError = "Failed to create category."
            }
        }
    }

    private func startEditing(_ cat: BudgetCategoryModel) {
        editingCategoryID = cat.id
        editingName = cat.name
        editingType = cat.type
        editingIcon = cat.icon ?? "wallet"
        editingColor = cat.color ?? "TEAL"
    }

    private func saveEdit(_ cat: BudgetCategoryModel) {
        let trimmed = editingName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        isSavingEdit = true
        Task {
            _ = await model.updateBudgetCategory(
                id: cat.id,
                name: trimmed,
                type: editingType,
                icon: editingIcon,
                color: editingColor
            )
            isSavingEdit = false
            editingCategoryID = nil
        }
    }

    private func archiveCategory(_ id: String) {
        Task {
            _ = await model.archiveBudgetCategory(id: id)
        }
    }
}
