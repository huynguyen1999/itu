import SwiftUI
import iTuDomain

struct Phase6TrashView: View {
    @ObservedObject var model: AppModel
    @State private var filter: Filter = .all
    @State private var isSelectionMode = false
    @State private var selectedItemIDs: Set<String> = []
    @State private var deleteTarget: TrashItem?
    @State private var showingBatchDeleteConfirmation = false
    @State private var isPerformingBatch = false

    init(model: AppModel) {
        self.model = model
    }

    private enum Filter: String, CaseIterable, Identifiable {
        case all, tasks, learning, journal, budget, gym
        var id: String { rawValue }
        var title: String { rawValue.capitalized }
    }

    private enum TrashItem: Identifiable, Hashable {
        case task(ProductivityTask)
        case deck(DeckModel)
        case card(CardModel)
        case journal(JournalNoteModel)
        case expense(ExpenseModel)
        case workout(WorkoutModel)
        case exercise(ExerciseModel)

        var id: String {
            switch self {
            case let .task(value): "task-\(value.id)"
            case let .deck(value): "deck-\(value.id)"
            case let .card(value): "card-\(value.id)"
            case let .journal(value): "journal-\(value.id)"
            case let .expense(value): "expense-\(value.id)"
            case let .workout(value): "workout-\(value.id)"
            case let .exercise(value): "exercise-\(value.id)"
            }
        }

        static func == (lhs: TrashItem, rhs: TrashItem) -> Bool {
            lhs.id == rhs.id
        }

        func hash(into hasher: inout Hasher) {
            hasher.combine(id)
        }

        var title: String {
            switch self {
            case let .task(value): value.title
            case let .deck(value): value.title
            case let .card(value): value.frontMarkdown.isEmpty ? "Untitled Flashcard" : value.frontMarkdown
            case let .journal(value): value.title.isEmpty ? "Untitled Journal Entry" : value.title
            case let .expense(value): value.merchant ?? value.category
            case let .workout(value): value.title
            case let .exercise(value): value.name
            }
        }

        var deletedAt: String? {
            switch self {
            case let .task(value): value.deletedAt
            case .deck, .card: nil
            case let .journal(value): value.deletedAt
            case let .expense(value): value.deletedAt
            case let .workout(value): value.deletedAt
            case let .exercise(value): value.deletedAt
            }
        }
    }

    private var allFilteredItems: [TrashItem] {
        var items: [TrashItem] = []
        if filterShows(.tasks) {
            items.append(contentsOf: model.trashedTasks.map { .task($0) })
        }
        if filterShows(.learning) {
            items.append(contentsOf: model.trashedDecks.map { .deck($0) })
            items.append(contentsOf: model.trashedCards.map { .card($0) })
        }
        if filterShows(.journal) {
            items.append(contentsOf: model.trashedJournalEntries.map { .journal($0) })
        }
        if filterShows(.budget) {
            items.append(contentsOf: model.trashedExpenses.map { .expense($0) })
        }
        if filterShows(.gym) {
            items.append(contentsOf: model.trashedGymWorkouts.map { .workout($0) })
            items.append(contentsOf: model.trashedGymExercises.map { .exercise($0) })
        }
        return items
    }

    private var totalFilteredCount: Int {
        allFilteredItems.count
    }

    private var isAllSelected: Bool {
        totalFilteredCount > 0 && selectedItemIDs.count == totalFilteredCount
    }

    var body: some View {
        VStack(spacing: 0) {
            List {
                Section {
                    Picker("Filter", selection: $filter) {
                        ForEach(Filter.allCases) { value in Text(value.title).tag(value) }
                    }
                    .pickerStyle(.menu)
                    if model.trashState == .failed("Trash is available when online.") {
                        Text("Trash is available when online.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else if let message = model.trashErrorMessage {
                        Label(message, systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(.orange)
                    }
                }

                if isSelectionMode && totalFilteredCount > 0 {
                    Section {
                        HStack {
                            Button(isAllSelected ? "Deselect All" : "Select All (\(totalFilteredCount))") {
                                toggleSelectAll()
                            }
                            .font(.subheadline.weight(.semibold))
                            Spacer()
                            Text("\(selectedItemIDs.count) of \(totalFilteredCount) selected")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if model.trashState.isLoading {
                    Section { ProgressView("Loading Trash…") }
                }

                if filterShows(.tasks) {
                    Section("Tasks (\(model.trashedTasks.count))") {
                        ForEach(model.trashedTasks) { task in
                            itemRow(.task(task))
                        }
                        emptyText(model.trashedTasks.isEmpty)
                    }
                }
                if filterShows(.learning) {
                    Section("Learning (\(model.trashedDecks.count + model.trashedCards.count))") {
                        ForEach(model.trashedDecks) { deck in
                            itemRow(.deck(deck))
                        }
                        ForEach(model.trashedCards) { card in
                            itemRow(.card(card))
                        }
                        emptyText(model.trashedDecks.isEmpty && model.trashedCards.isEmpty)
                    }
                }
                if filterShows(.journal) {
                    Section("Journal (\(model.trashedJournalEntries.count))") {
                        ForEach(model.trashedJournalEntries) { entry in
                            itemRow(.journal(entry))
                        }
                        emptyText(model.trashedJournalEntries.isEmpty)
                    }
                }
                if filterShows(.budget) {
                    Section("Budget (\(model.trashedExpenses.count))") {
                        ForEach(model.trashedExpenses) { expense in
                            itemRow(.expense(expense))
                        }
                        emptyText(model.trashedExpenses.isEmpty)
                    }
                }
                if filterShows(.gym) {
                    Section("Gym (\(model.trashedGymWorkouts.count + model.trashedGymExercises.count))") {
                        ForEach(model.trashedGymWorkouts) { workout in
                            itemRow(.workout(workout))
                        }
                        ForEach(model.trashedGymExercises) { exercise in
                            itemRow(.exercise(exercise))
                        }
                        emptyText(model.trashedGymWorkouts.isEmpty && model.trashedGymExercises.isEmpty)
                    }
                }
            }
            .refreshable { await model.refreshTrash() }

            if isSelectionMode && !selectedItemIDs.isEmpty {
                batchActionBar
            }
        }
        .navigationTitle("Trash")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                if totalFilteredCount > 0 {
                    Button(isSelectionMode ? "Done" : "Select") {
                        isSelectionMode.toggle()
                        if !isSelectionMode {
                            selectedItemIDs.removeAll()
                        }
                    }
                }
                Button("Refresh") { Task { await model.refreshTrash() } }
                    .disabled(model.trashIsLoading)
            }
        }
        .task { await model.refreshTrash() }
        .confirmationDialog(
            "Permanently delete \(deleteTarget?.title ?? "item")?",
            isPresented: Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } }),
            presenting: deleteTarget
        ) { target in
            Button("Delete permanently", role: .destructive) { Task { await permanentlyDeleteItem(target) } }
            Button("Cancel", role: .cancel) { deleteTarget = nil }
        } message: { _ in
            Text("This removes the item from the server and cannot be undone. It is available only when online.")
        }
        .confirmationDialog(
            "Permanently delete \(selectedItemIDs.count) items?",
            isPresented: $showingBatchDeleteConfirmation
        ) {
            Button("Delete \(selectedItemIDs.count) items permanently", role: .destructive) {
                Task { await performBatchPermanentDelete() }
            }
            Button("Cancel", role: .cancel) { showingBatchDeleteConfirmation = false }
        } message: {
            Text("This will permanently remove \(selectedItemIDs.count) selected items from the server. This action cannot be undone.")
        }
    }

    private var batchActionBar: some View {
        VStack(spacing: 8) {
            Divider()
            HStack(spacing: 12) {
                Button("Restore Selected (\(selectedItemIDs.count))") {
                    Task { await performBatchRestore() }
                }
                .buttonStyle(.borderedProminent)
                .tint(.teal)
                .font(.caption.weight(.semibold))
                .disabled(isPerformingBatch)

                Spacer()

                Button("Delete Selected (\(selectedItemIDs.count))", role: .destructive) {
                    showingBatchDeleteConfirmation = true
                }
                .buttonStyle(.bordered)
                .tint(.red)
                .font(.caption.weight(.semibold))
                .disabled(isPerformingBatch)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(Color(uiColor: .secondarySystemBackground))
    }

    private func toggleSelectAll() {
        if isAllSelected {
            selectedItemIDs.removeAll()
        } else {
            selectedItemIDs = Set(allFilteredItems.map(\.id))
        }
    }

    private func itemRow(_ item: TrashItem) -> some View {
        let isSelected = selectedItemIDs.contains(item.id)
        return HStack(alignment: .top, spacing: 12) {
            if isSelectionMode {
                Button {
                    if isSelected {
                        selectedItemIDs.remove(item.id)
                    } else {
                        selectedItemIDs.insert(item.id)
                    }
                } label: {
                    Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                        .foregroundStyle(isSelected ? Color.teal : Color.secondary)
                        .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(item.title).font(.headline)
                if let deletedAt = item.deletedAt {
                    Text("Deleted \(deletedAt)").font(.caption).foregroundStyle(.secondary)
                }

                if !isSelectionMode {
                    ViewThatFits(in: .horizontal) {
                        HStack {
                            Button("Restore") { Task { await restoreItem(item) } }
                            Button("Delete permanently", role: .destructive) { deleteTarget = item }
                        }
                        VStack(alignment: .leading) {
                            Button("Restore") { Task { await restoreItem(item) } }
                            Button("Delete permanently", role: .destructive) { deleteTarget = item }
                        }
                    }
                    .buttonStyle(.bordered)
                    .font(.caption)
                }
            }
        }
        .padding(.vertical, 3)
        .contentShape(Rectangle())
        .onTapGesture {
            if isSelectionMode {
                if isSelected {
                    selectedItemIDs.remove(item.id)
                } else {
                    selectedItemIDs.insert(item.id)
                }
            }
        }
    }

    @ViewBuilder
    private func emptyText(_ isEmpty: Bool) -> some View {
        if isEmpty { Text("Nothing in this filter.").foregroundStyle(.secondary) }
    }

    private func filterShows(_ value: Filter) -> Bool { filter == .all || filter == value }

    private func restoreItem(_ item: TrashItem) async {
        switch item {
        case let .task(value): _ = await model.restoreTrashTask(value)
        case let .deck(value): _ = await model.restoreTrashDeck(value)
        case let .card(value): _ = await model.restoreTrashCard(value)
        case let .journal(value): _ = await model.restoreTrashJournalEntry(value)
        case let .expense(value): _ = await model.restoreTrashExpense(value)
        case let .workout(value): _ = await model.restoreTrashGymWorkout(value)
        case let .exercise(value): _ = await model.restoreTrashGymExercise(value)
        }
    }

    private func permanentlyDeleteItem(_ target: TrashItem) async {
        deleteTarget = nil
        switch target {
        case let .task(value): _ = await model.permanentlyDeleteTrashTask(value)
        case let .deck(value): _ = await model.permanentlyDeleteTrashDeck(value)
        case let .card(value): _ = await model.permanentlyDeleteTrashCard(value)
        case let .journal(value): _ = await model.permanentlyDeleteTrashJournalEntry(value)
        case let .expense(value): _ = await model.permanentlyDeleteTrashExpense(value)
        case let .workout(value): _ = await model.permanentlyDeleteTrashGymWorkout(value)
        case let .exercise(value): _ = await model.permanentlyDeleteTrashGymExercise(value)
        }
    }

    private func performBatchRestore() async {
        isPerformingBatch = true
        let selectedItems = allFilteredItems.filter { selectedItemIDs.contains($0.id) }
        for item in selectedItems {
            await restoreItem(item)
        }
        selectedItemIDs.removeAll()
        isPerformingBatch = false
        await model.refreshTrash()
    }

    private func performBatchPermanentDelete() async {
        isPerformingBatch = true
        showingBatchDeleteConfirmation = false
        let selectedItems = allFilteredItems.filter { selectedItemIDs.contains($0.id) }
        for item in selectedItems {
            await permanentlyDeleteItem(item)
        }
        selectedItemIDs.removeAll()
        isPerformingBatch = false
        await model.refreshTrash()
    }
}
