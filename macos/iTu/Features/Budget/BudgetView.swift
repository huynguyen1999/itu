import SwiftUI

struct BudgetView: View {
    @Environment(AppModel.self) private var model
    @SceneStorage("budget.selectedTab") private var selectedTab = "Overview"
    @SceneStorage("budget.selectedPeriod") private var selectedPeriod = BudgetSupport.currentPeriod
    @SceneStorage("budget.transactionTypeFilter") private var transactionTypeFilter = ""
    @SceneStorage("budget.transactionCategoryFilter") private var transactionCategoryFilter = ""
    @State private var showAddTransaction = false
    @State private var settingsOpen = false

    var body: some View {
        HStack(spacing: 0) {
            secondaryRail

            VStack(alignment: .leading, spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        if showAddTransaction {
                            TransactionQuickAddView {
                                showAddTransaction = false
                                Task { await loadBudgetData(force: true) }
                            }
                        }

                        switch selectedTab {
                        case "Overview":
                            BudgetOverviewView(
                                selectedPeriod: $selectedPeriod,
                                onAddTransactionClicked: { showAddTransaction.toggle() }
                            )
                        case "Transactions":
                            BudgetTransactionsView(
                                typeFilter: $transactionTypeFilter,
                                categoryFilter: $transactionCategoryFilter,
                                onAddTransactionClicked: { showAddTransaction.toggle() }
                            )
                        case "Categories":
                            BudgetCategoriesView()
                        default:
                            BudgetLimitsView(selectedPeriod: $selectedPeriod)
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
        .onChange(of: selectedPeriod) { _, _ in
            Task { await loadBudgetData(force: true) }
        }
        .onChange(of: transactionTypeFilter) { _, _ in
            Task { await loadBudgetData(force: true) }
        }
        .onChange(of: transactionCategoryFilter) { _, _ in
            Task { await loadBudgetData(force: true) }
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
                railButton("Overview", icon: "chart.pie.fill", tab: "Overview")
                railButton("Transactions", icon: "list.bullet.rectangle.portrait", tab: "Transactions")
                railButton("Budgets", icon: "target", tab: "Budgets")
                railButton("Categories", icon: "square.grid.2x2", tab: "Categories")
            }
            .padding(.horizontal, 10)
            .padding(.top, 14)

            Spacer()
        }
        .frame(width: 220)
        .background(iTuTheme.surface)
        .overlay(alignment: .trailing) {
            Rectangle().fill(iTuTheme.border).frame(width: 1)
        }
    }

    private func railButton(_ title: String, icon: String, tab: String) -> some View {
        let isSelected = selectedTab == tab
        return Button {
            selectedTab = tab
        } label: {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .frame(width: 20)
                    .foregroundStyle(isSelected ? iTuTheme.teal : iTuTheme.inkDim)
                Text(title)
                    .font(.system(size: 13, weight: isSelected ? .semibold : .medium))
                    .foregroundStyle(isSelected ? iTuTheme.ink : iTuTheme.inkDim)
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(isSelected ? iTuTheme.surfaceMuted : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                if isSelected {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(iTuTheme.border, lineWidth: 1)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var pageHeader: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text(selectedTab)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
                Text(headerSubtitle)
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
            }
            Spacer()
            HStack(spacing: 8) {
                Button {
                    showAddTransaction.toggle()
                } label: {
                    Label(showAddTransaction ? "Close Entry" : "Log Transaction", systemImage: showAddTransaction ? "xmark" : "plus")
                }
                .buttonStyle(iTuSecondaryButtonStyle(height: 28))

                Button("Budget settings", systemImage: "gearshape") {
                    settingsOpen.toggle()
                }
                .labelStyle(.iconOnly)
                .buttonStyle(.plain)
                .help("Budget preferences")
                .popover(isPresented: $settingsOpen, arrowEdge: .top) {
                    BudgetSettingsPopoverView()
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .background(iTuTheme.canvas)
    }

    private var headerSubtitle: String {
        switch selectedTab {
        case "Overview":
            return "Monitor monthly cash flow, assigned targets, and category spending."
        case "Transactions":
            return "View and search logged expenses and income."
        case "Budgets":
            return "Set overall monthly spending goals and allocate category limits."
        case "Categories":
            return "Manage custom categories, icons, and color themes."
        default:
            return "Personal finance tracking."
        }
    }

    private func loadBudgetData(force: Bool) async {
        await model.refreshCoordinator.run(.budget) {
            await model.loadBudgetOverview(period: selectedPeriod)
            await model.loadBudgetCategories()
            await model.loadBudgetTransactions(
                period: selectedPeriod,
                categoryID: transactionCategoryFilter.isEmpty ? nil : transactionCategoryFilter,
                type: transactionTypeFilter.isEmpty ? nil : transactionTypeFilter
            )
        }
    }
}

