import SwiftUI
import iTuDomain

struct Phase6TrashView: View {
    @ObservedObject var model: AppModel
    @State private var filter: Filter = .all
    @State private var deleteTarget: DeleteTarget?

    init(model: AppModel) {
        self.model = model
    }

    private enum Filter: String, CaseIterable, Identifiable {
        case all, tasks, learning, journal, budget, gym
        var id: String { rawValue }
        var title: String { rawValue.capitalized }
    }

    private enum DeleteTarget: Identifiable {
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
    }

    var body: some View {
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

            if model.trashState.isLoading {
                Section { ProgressView("Loading Trash…") }
            }

            if filterShows(.tasks) {
                Section("Tasks") {
                    ForEach(model.trashedTasks) { task in
                        row(title: task.title, deletedAt: task.deletedAt, restore: { Task { _ = await model.restoreTrashTask(task) } }, delete: { deleteTarget = .task(task) })
                    }
                    emptyText(model.trashedTasks.isEmpty)
                }
            }
            if filterShows(.learning) {
                Section("Learning") {
                    ForEach(model.trashedDecks) { deck in
                        row(title: deck.title, deletedAt: nil, restore: { Task { _ = await model.restoreTrashDeck(deck) } }, delete: { deleteTarget = .deck(deck) })
                    }
                    ForEach(model.trashedCards) { card in
                        row(title: card.frontMarkdown.isEmpty ? "Untitled Flashcard" : card.frontMarkdown, deletedAt: nil, restore: { Task { _ = await model.restoreTrashCard(card) } }, delete: { deleteTarget = .card(card) })
                    }
                    emptyText(model.trashedDecks.isEmpty && model.trashedCards.isEmpty)
                }
            }
            if filterShows(.journal) {
                Section("Journal") {
                    ForEach(model.trashedJournalEntries) { entry in
                        row(title: entry.title.isEmpty ? "Untitled Journal Entry" : entry.title, deletedAt: entry.deletedAt, restore: { Task { _ = await model.restoreTrashJournalEntry(entry) } }, delete: { deleteTarget = .journal(entry) })
                    }
                    emptyText(model.trashedJournalEntries.isEmpty)
                }
            }
            if filterShows(.budget) {
                Section("Budget") {
                    ForEach(model.trashedExpenses) { expense in
                        row(title: expense.merchant ?? expense.category, deletedAt: expense.deletedAt, restore: { Task { _ = await model.restoreTrashExpense(expense) } }, delete: { deleteTarget = .expense(expense) })
                    }
                    emptyText(model.trashedExpenses.isEmpty)
                }
            }
            if filterShows(.gym) {
                Section("Gym") {
                    ForEach(model.trashedGymWorkouts) { workout in
                        row(title: workout.title, deletedAt: workout.deletedAt, restore: { Task { _ = await model.restoreTrashGymWorkout(workout) } }, delete: { deleteTarget = .workout(workout) })
                    }
                    ForEach(model.trashedGymExercises) { exercise in
                        row(title: exercise.name, deletedAt: exercise.deletedAt, restore: { Task { _ = await model.restoreTrashGymExercise(exercise) } }, delete: { deleteTarget = .exercise(exercise) })
                    }
                    emptyText(model.trashedGymWorkouts.isEmpty && model.trashedGymExercises.isEmpty)
                }
            }
        }
        .navigationTitle("Trash")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Refresh") { Task { await model.refreshTrash() } }
                    .disabled(model.trashIsLoading)
            }
        }
        .task { await model.refreshTrash() }
        .refreshable { await model.refreshTrash() }
        .confirmationDialog(
            "Permanently delete \(deleteTarget?.title ?? "item")?",
            isPresented: Binding(get: { deleteTarget != nil }, set: { if !$0 { deleteTarget = nil } }),
            presenting: deleteTarget
        ) { target in
            Button("Delete permanently", role: .destructive) { Task { await permanentlyDelete(target) } }
            Button("Cancel", role: .cancel) { deleteTarget = nil }
        } message: { _ in
            Text("This removes the item from the server and cannot be undone. It is available only when online.")
        }
    }

    @ViewBuilder
    private func row(title: String, deletedAt: String?, restore: @escaping () -> Void, delete: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.headline)
            if let deletedAt { Text("Deleted \(deletedAt)").font(.caption).foregroundStyle(.secondary) }
            ViewThatFits(in: .horizontal) {
                HStack {
                    Button("Restore", action: restore)
                    Button("Delete permanently", role: .destructive, action: delete)
                }
                VStack(alignment: .leading) {
                    Button("Restore", action: restore)
                    Button("Delete permanently", role: .destructive, action: delete)
                }
            }
            .buttonStyle(.bordered)
            .font(.caption)
        }
        .padding(.vertical, 3)
    }

    @ViewBuilder
    private func emptyText(_ isEmpty: Bool) -> some View {
        if isEmpty { Text("Nothing in this filter.").foregroundStyle(.secondary) }
    }

    private func filterShows(_ value: Filter) -> Bool { filter == .all || filter == value }

    private func permanentlyDelete(_ target: DeleteTarget) async {
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
}
