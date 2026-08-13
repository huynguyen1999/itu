import SwiftUI

struct TrashView: View {
    @Environment(AppModel.self) private var model
    @State private var filter: TrashFilter = .all
    @State private var deleteTarget: TrashDeleteTarget?

    private var tasks: [ProductivityTask] { model.trashedTasks }
    private var decks: [DeckModel] { model.trashSnapshot?.decks ?? [] }
    private var cards: [CardModel] { model.trashSnapshot?.cards ?? [] }
    private var journal: [JournalNoteModel] { model.trashedJournalEntries }
    private var budget: [BudgetTransactionModel] { model.trashedBudgetTransactions }
    private var workouts: [WorkoutModel] { model.trashedGymWorkouts }
    private var exercises: [ExerciseModel] { model.trashedGymExercises }

    private var totalCount: Int { tasks.count + decks.count + cards.count + journal.count + budget.count + workouts.count + exercises.count }

    private var filteredCount: Int {
        switch filter {
        case .all: totalCount
        case .tasks: tasks.count
        case .journal: journal.count
        case .budget: budget.count
        case .gym: workouts.count + exercises.count
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if let error = model.trashErrorMessage, model.trashSnapshot != nil || totalCount > 0 {
                    HStack(spacing: 10) {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .font(.system(size: 12)).foregroundStyle(iTuTheme.coral)
                        Spacer()
                        Button("Retry") { Task { await model.refreshTrash() } }
                            .buttonStyle(iTuSecondaryButtonStyle(height: 28))
                    }
                    .padding(10)
                    .background(iTuTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }

                if model.trashIsLoading && model.trashSnapshot == nil && totalCount == 0 {
                    ProgressView("Loading Trash…").frame(maxWidth: .infinity, minHeight: 220).iTuPanel(radius: 14)
                } else if let error = model.trashErrorMessage, model.trashSnapshot == nil && totalCount == 0 {
                    VStack(spacing: 10) {
                        Image(systemName: "exclamationmark.triangle").font(.system(size: 28)).foregroundStyle(iTuTheme.coral)
                        Text(error).font(.system(size: 13)).foregroundStyle(iTuTheme.inkDim).multilineTextAlignment(.center)
                        Button("Try Again") { Task { await model.refreshTrash() } }.buttonStyle(iTuSecondaryButtonStyle(height: 32))
                    }.frame(maxWidth: .infinity, minHeight: 220).iTuPanel(radius: 14)
                } else if filteredCount == 0 {
                    VStack(spacing: 10) {
                        Image(systemName: "archivebox").font(.system(size: 26)).foregroundStyle(iTuTheme.inkDim)
                        Text(filter.emptyMessage)
                            .font(.system(size: 16, weight: .semibold))
                        Text("Deleted content will appear here.").font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim)
                    }.frame(maxWidth: .infinity, minHeight: 220).iTuPanel(radius: 14)
                } else {
                    content
                }
            }
            .padding(24).frame(maxWidth: 980).frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .iTuPinnedHeader {
            VStack(alignment: .leading, spacing: 14) {
                trashHeader
                Picker("Trash filter", selection: $filter) {
                    ForEach(TrashFilter.allCases) { value in Text(value.title).tag(value) }
                }
                .pickerStyle(.segmented)
                .accessibilityLabel("Trash filter")
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 18)
        }
        .background(iTuTheme.canvas)
        .alert(item: $deleteTarget) { target in
            Alert(title: Text("Delete permanently?"), message: Text(target.message), primaryButton: .destructive(Text("Delete permanently")) {
                Task { await performPermanentDelete(target) }
            }, secondaryButton: .cancel())
        }
        .task {
            await model.refreshCoordinator.run(.trash) {
                await model.refreshTrash()
            }
        }
    }

    private var trashHeader: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 5) {
                iTuSectionLabel(title: "SYSTEM & MAINTENANCE", color: iTuTheme.inkFaint)
                Text("Trash").font(.system(size: 26, weight: .bold, design: .rounded))
                Text("Recover deleted content or permanently remove it.")
                    .font(.system(size: 13)).foregroundStyle(iTuTheme.inkDim)
            }
            Spacer()
            if model.syncPhase == .pending || model.syncPhase == .syncing {
                Label("Pending sync", systemImage: "arrow.triangle.2.circlepath")
                    .font(.system(size: 11, weight: .medium)).foregroundStyle(iTuTheme.amber)
            }
            Text("\(totalCount) item\(totalCount == 1 ? "" : "s")")
                .font(.system(size: 12, weight: .bold)).foregroundStyle(iTuTheme.inkDim)
                .padding(.horizontal, 10).padding(.vertical, 6).background(iTuTheme.surface).clipShape(Capsule())
        }
    }

    @ViewBuilder
    private var content: some View {
        VStack(alignment: .leading, spacing: 16) {
            if filter == .all || filter == .tasks { section("Tasks", icon: "checkmark.square", tasks) { taskRow($0) } }
            if filter == .all { section("Decks", icon: "square.stack.3d.up", decks) { deckRow($0) }; section("Cards", icon: "rectangle.stack.badge.xmark", cards) { cardRow($0) } }
            if filter == .all || filter == .journal { section("Journal", icon: "book.closed", journal) { journalRow($0) } }
            if filter == .all || filter == .budget { section("Budget", icon: "creditcard", budget) { budgetRow($0) } }
            if filter == .all || filter == .gym {
                section("Gym Workouts", icon: "figure.strengthtraining.traditional", workouts) { workoutRow($0) }
                section("Gym Exercises", icon: "dumbbell", exercises) { exerciseRow($0) }
            }
        }
    }

    @ViewBuilder
    private func section<Item: Identifiable, Row: View>(_ title: String, icon: String, _ items: [Item], @ViewBuilder row: @escaping (Item) -> Row) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Label("\(title) · \(items.count)", systemImage: icon).font(.system(size: 15, weight: .bold)).foregroundStyle(iTuTheme.ink)
                VStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                        row(item)
                        if index < items.count - 1 { Divider().padding(.leading, 12) }
                    }
                }.iTuPanel(radius: 12)
            }
        }
    }

    private func taskRow(_ task: ProductivityTask) -> some View { row(title: task.title, type: "Task", deletedAt: task.deletedAt, restore: { Task { await model.restoreTrashTask(task) } }, remove: { deleteTarget = .task(task) }) }
    private func deckRow(_ deck: DeckModel) -> some View { row(title: deck.title, type: "Flashcard Deck", deletedAt: nil, restore: { Task { await model.restoreTrashDeck(deck) } }, remove: { deleteTarget = .deck(deck) }) }
    private func cardRow(_ card: CardModel) -> some View { row(title: card.frontMarkdown.isEmpty ? "Untitled Flashcard" : card.frontMarkdown, type: "Flashcard", deletedAt: nil, restore: { Task { await model.restoreTrashCard(card) } }, remove: { deleteTarget = .card(card) }) }
    private func journalRow(_ value: JournalNoteModel) -> some View { row(title: value.title.isEmpty ? "Untitled note" : value.title, type: value.kind == "WEEKLY_REVIEW" ? "Weekly Review" : "Journal Entry", deletedAt: value.deletedAt, restore: { Task { await model.restoreTrashJournalEntry(value) } }, remove: { deleteTarget = .journal(value) }) }
    private func budgetRow(_ value: BudgetTransactionModel) -> some View { row(title: value.merchant ?? value.category, type: "Budget Transaction", deletedAt: value.deletedAt, restore: { Task { await model.restoreTrashBudgetTransaction(value) } }, remove: { deleteTarget = .budget(value) }) }
    private func workoutRow(_ value: WorkoutModel) -> some View { row(title: value.title, type: "Gym Workout", deletedAt: value.deletedAt, restore: { Task { await model.restoreTrashGymWorkout(value) } }, remove: { deleteTarget = .workout(value) }) }
    private func exerciseRow(_ value: ExerciseModel) -> some View { row(title: value.name, type: "Exercise", deletedAt: value.deletedAt, restore: { Task { await model.restoreTrashGymExercise(value) } }, remove: { deleteTarget = .exercise(value) }) }

    private func row(title: String, type: String, deletedAt: String?, restore: @escaping () -> Void, remove: @escaping () -> Void) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "trash").foregroundStyle(iTuTheme.coral)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.system(size: 13, weight: .medium)).lineLimit(1)
                Text(deletedAtLabel(deletedAt, type: type)).font(.system(size: 11)).foregroundStyle(iTuTheme.inkFaint).lineLimit(1)
            }
            Spacer()
            Button("Restore", action: restore).buttonStyle(iTuSecondaryButtonStyle(height: 28)).disabled(model.syncPhase == .syncing)
            Button("Delete permanently", action: remove).buttonStyle(iTuDangerButtonStyle()).disabled(model.syncPhase == .syncing)
        }
        .padding(12)
        .accessibilityElement(children: .contain)
    }

    private func deletedAtLabel(_ value: String?, type: String) -> String {
        guard let value else { return type }
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: value) else { return "\(type) · Deleted recently" }
        let relative = RelativeDateTimeFormatter().localizedString(for: date, relativeTo: Date())
        return "\(type) · Deleted \(relative)"
    }

    private func performPermanentDelete(_ target: TrashDeleteTarget) async {
        switch target {
        case let .task(value): await model.permanentlyDeleteTrashTask(value)
        case let .deck(value): await model.permanentlyDeleteTrashDeck(value)
        case let .card(value): await model.permanentlyDeleteTrashCard(value)
        case let .journal(value): await model.permanentlyDeleteTrashJournalEntry(value)
        case let .budget(value): await model.permanentlyDeleteTrashBudgetTransaction(value)
        case let .workout(value): await model.permanentlyDeleteTrashGymWorkout(value)
        case let .exercise(value): await model.permanentlyDeleteTrashGymExercise(value)
        }
    }
}

enum TrashFilter: String, CaseIterable, Identifiable {
    case all, tasks, journal, budget, gym
    var id: String { rawValue }
    var title: String { rawValue == "all" ? "All" : rawValue.capitalized }
    var emptyMessage: String { self == .all ? "Trash is empty" : "No deleted \(title.lowercased())" }
}

private enum TrashDeleteTarget: Identifiable {
    case task(ProductivityTask), deck(DeckModel), card(CardModel), journal(JournalNoteModel), budget(BudgetTransactionModel), workout(WorkoutModel), exercise(ExerciseModel)
    var id: String {
        switch self { case let .task(v): "task-\(v.id)"; case let .deck(v): "deck-\(v.id)"; case let .card(v): "card-\(v.id)"; case let .journal(v): "journal-\(v.id)"; case let .budget(v): "budget-\(v.id)"; case let .workout(v): "workout-\(v.id)"; case let .exercise(v): "exercise-\(v.id)" }
    }
    var message: String {
        switch self { case let .task(v): "\(v.title) will no longer be recoverable."; case let .deck(v): "\(v.title) and its cards will no longer be recoverable."; case .card: "This Flashcard will no longer be recoverable."; case let .journal(v): "\(v.title.isEmpty ? "This Journal Entry" : v.title) will no longer be recoverable."; case .budget: "This Budget Transaction will no longer be recoverable."; case let .workout(v): "\(v.title) will no longer be recoverable."; case let .exercise(v): "\(v.name) will no longer be recoverable." }
    }
}
