import Foundation
import Observation

enum CompanionTab: Int, CaseIterable, Identifiable {
    case tasksHabits = 1
    case note = 2
    case focus = 3
    case deck = 4

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .tasksHabits: "Tasks & Habits"
        case .note: "Note"
        case .focus: "Focus"
        case .deck: "Deck"
        }
    }

    var icon: String {
        switch self {
        case .tasksHabits: "checklist"
        case .note: "square.and.pencil"
        case .focus: "timer"
        case .deck: "rectangle.stack"
        }
    }
}

struct CompanionDailyStatus: Equatable {
    var taskCount = 0
    var habitCount = 0
    var focusedMinutes = 0
    var dueCardCount = 0
}

enum CompanionNoteSaveState: Equatable {
    case idle, unsaved, saving, saved, retry

    var label: String {
        switch self {
        case .idle: "Today"
        case .unsaved: "Unsaved"
        case .saving: "Saving…"
        case .saved: "Saved"
        case .retry: "Retry"
        }
    }
}

enum CompanionSearchSection: String {
    case quickCapture = "QUICK CAPTURE"
    case commands = "COMMANDS"
    case tasks = "TASKS"
    case habits = "HABITS"
    case notes = "JOURNAL NOTES"
    case decks = "FLASHCARD DECKS"
}

struct CompanionSearchItem: Identifiable {
    let id: String
    let section: CompanionSearchSection
    let title: String
    let subtitle: String?
    let icon: String
    let action: @MainActor () -> Void
}

struct CompanionHabitRow: Identifiable {
    let habit: HabitModel
    let occurrence: HabitOccurrenceModel
    var id: String { occurrence.id }
}

@MainActor
@Observable
final class CompanionViewModel {
    let model: AppModel
    let router: AppNavigationRouter
    let dismissCompanion: () -> Void

    var selectedTab: CompanionTab = .tasksHabits
    var searchText = "" { didSet { selectedSearchIndex = 0 } }
    var selectedSearchItemID: String?
    var isTaskCapturing = false
    var taskCaptureText = ""
    var scrollTarget: String?

    var noteID: String?
    var noteTitle = "" { didSet { noteDidChange() } }
    var noteBody = "" { didSet { noteDidChange() } }
    var noteSaveState: CompanionNoteSaveState = .idle

    var addingCardDeckID: String?
    var cardFront = ""
    var cardBack = ""
    var cardValidationMessage: String?
    var reviewingDeckID: String?
    var reviewSessionID: String?
    var reviewCards: [CardModel] = []
    var reviewIndex = 0
    var reviewRevealed = false
    var reviewGrades: [Int] = []
    var deckMessage: String?

    @ObservationIgnored private var noteSaveTask: Task<Void, Never>?
    @ObservationIgnored private var isHydratingNote = false
    @ObservationIgnored private var noteIsDirty = false
    @ObservationIgnored private var noteRevision = 0

    init(model: AppModel, router: AppNavigationRouter, dismissCompanion: @escaping () -> Void) {
        self.model = model
        self.router = router
        self.dismissCompanion = dismissCompanion
    }

    deinit { noteSaveTask?.cancel() }

    var today: String { Date().formatted(iTuDateSupport.day) }

    var todayTasks: [ProductivityTask] {
        Self.partitionTasks(model.tasks, day: today).today
    }

    var overdueTasks: [ProductivityTask] {
        Self.partitionTasks(model.tasks, day: today).overdue
    }

    var todayHabits: [CompanionHabitRow] {
        let habitsByID = Dictionary(uniqueKeysWithValues: model.habits.filter { $0.archivedAt == nil }.map { ($0.id, $0) })
        return model.habitOccurrences
            .filter { $0.localDayString == today }
            .compactMap { occurrence in
                habitsByID[occurrence.habitId].map { CompanionHabitRow(habit: $0, occurrence: occurrence) }
            }
            .sorted { $0.habit.name.localizedStandardCompare($1.habit.name) == .orderedAscending }
    }

    var sortedDecks: [DeckModel] {
        model.decks.sorted {
            if ($0.dueCount > 0) != ($1.dueCount > 0) { return $0.dueCount > 0 }
            if $0.dueCount != $1.dueCount { return $0.dueCount > $1.dueCount }
            return $0.title.localizedStandardCompare($1.title) == .orderedAscending
        }
    }

    var focusTaskCandidates: [ProductivityTask] {
        let todayIDs = Set(todayTasks.map(\.id))
        return model.tasks
            .filter {
                $0.deletedAt == nil && $0.parentId == nil &&
                $0.status != .completed && $0.status != .canceled && $0.status != .archived
            }
            .sorted {
                if todayIDs.contains($0.id) != todayIDs.contains($1.id) { return todayIDs.contains($0.id) }
                if $0.important != $1.important { return $0.important }
                return $0.title.localizedStandardCompare($1.title) == .orderedAscending
            }
    }

    var dailyStatus: CompanionDailyStatus {
        let liveMinutes: Int
        if let session = model.focusTimer.activeSession,
           session.phase == .work,
           session.status != .abandoned,
           iTuDateSupport.localDayString(from: session.startedAt) == today {
            liveMinutes = model.focusTimer.elapsedSeconds / 60
        } else {
            liveMinutes = 0
        }
        return CompanionDailyStatus(
            taskCount: todayTasks.count,
            habitCount: todayHabits.count,
            focusedMinutes: model.focusTimer.todayFocusedMinutes + liveMinutes,
            dueCardCount: model.decks.reduce(0) { $0 + max(0, $1.dueCount) }
        )
    }

    var searchItems: [CompanionSearchItem] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return [] }
        let needle = query.localizedLowercase
        var results = [CompanionSearchItem(
            id: "capture",
            section: .quickCapture,
            title: "Create task: “\(query)”",
            subtitle: "Add to Inbox",
            icon: "plus.circle.fill"
        ) { [weak self] in Task { await self?.captureTask(query) } }]

        let commands: [(String, String, String, @MainActor () -> Void)] = [
            ("Open today's tasks", "Open today’s tasks", "sun.max", { [weak self] in self?.openSection(.today) }),
            ("Open habits", "Open Habits", "repeat", { [weak self] in self?.openSection(.habits) }),
            ("Open journal", "Open Journal", "book.closed", { [weak self] in self?.openSection(.journal) }),
            ("Open flashcards", "Open Flashcards", "rectangle.stack", { [weak self] in self?.openSection(.learn) }),
            ("Open settings", "Open Settings", "gearshape", { [weak self] in self?.router.openSettings(); self?.dismissCompanion() }),
            ("Open full itu", "Open full iTu", "arrow.up.right.square", { [weak self] in self?.router.openMainWindow(); self?.dismissCompanion() })
        ]
        for command in commands where command.0.localizedLowercase.contains(needle) {
            results.append(CompanionSearchItem(id: "command-\(command.0)", section: .commands, title: command.1, subtitle: "Command", icon: command.2, action: command.3))
        }

        for task in model.tasks.filter({ $0.deletedAt == nil && $0.status != .archived && $0.status != .canceled && $0.title.localizedLowercase.contains(needle) }).prefix(8) {
            results.append(CompanionSearchItem(id: "task-\(task.id)", section: .tasks, title: task.title, subtitle: task.status.displayName, icon: task.status == .completed ? "checkmark.circle.fill" : "circle") { [weak self] in self?.openTask(task) })
        }
        for habit in model.habits.filter({ $0.archivedAt == nil && $0.name.localizedLowercase.contains(needle) }).prefix(5) {
            results.append(CompanionSearchItem(id: "habit-\(habit.id)", section: .habits, title: habit.name, subtitle: "Habit", icon: "repeat") { [weak self] in self?.openSection(.habits) })
        }
        for note in model.journalNotes.filter({ $0.deletedAt == nil && $0.dailyReview == nil && $0.weeklyReview == nil && $0.kind != "DAILY_REVIEW" && $0.kind != "WEEKLY_REVIEW" && ($0.title.localizedLowercase.contains(needle) || $0.contentMarkdown.localizedLowercase.contains(needle)) }).prefix(5) {
            results.append(CompanionSearchItem(id: "note-\(note.id)", section: .notes, title: note.title, subtitle: note.entryDate, icon: "doc.text") { [weak self] in self?.openSection(.journal) })
        }
        for deck in model.decks.filter({ $0.title.localizedLowercase.contains(needle) || $0.description.localizedLowercase.contains(needle) }).prefix(5) {
            results.append(CompanionSearchItem(id: "deck-\(deck.id)", section: .decks, title: deck.title, subtitle: "\(deck.dueCount) due", icon: deck.icon) { [weak self] in self?.selectTab(.deck) })
        }
        return results
    }

    var selectedSearchIndex: Int {
        get {
            guard let selectedSearchItemID,
                  let index = searchItems.firstIndex(where: { $0.id == selectedSearchItemID }) else { return 0 }
            return index
        }
        set { selectedSearchItemID = searchItems.indices.contains(newValue) ? searchItems[newValue].id : nil }
    }

    func prepareForPresentation() {
        resetForPresentation()
        Task {
            async let habits: Void = model.refreshHabitOccurrences(from: today, to: today)
            async let focus: Void = model.loadFocus()
            async let notes: Void = model.loadJournalNotes()
            _ = await (habits, focus, notes)
        }
    }

    func resetForPresentation() {
        selectedTab = .tasksHabits
        searchText = ""
        selectedSearchItemID = nil
        isTaskCapturing = false
        taskCaptureText = ""
        cancelDeckFlow()
        deckMessage = nil
    }

    func prepareForDismissal() {
        noteSaveTask?.cancel()
        Task { await flushNote() }
    }

    func selectTab(_ tab: CompanionTab) {
        guard tab != selectedTab || !searchText.isEmpty else { return }
        if selectedTab == .note { noteSaveTask?.cancel(); Task { await flushNote() } }
        searchText = ""
        selectedSearchItemID = nil
        isTaskCapturing = false
        taskCaptureText = ""
        cancelDeckFlow()
        deckMessage = nil
        selectedTab = tab
    }

    /// Returns true when Escape canceled an inner flow; false means the panel may close.
    func handleEscape() -> Bool {
        if !searchText.isEmpty { searchText = ""; return true }
        if isTaskCapturing { isTaskCapturing = false; taskCaptureText = ""; return true }
        if addingCardDeckID != nil || reviewingDeckID != nil { cancelDeckFlow(); return true }
        return false
    }

    func moveSearchSelection(_ delta: Int) {
        guard !searchItems.isEmpty else { return }
        selectedSearchIndex = (selectedSearchIndex + delta + searchItems.count) % searchItems.count
    }

    func executeSearchSelection() {
        guard searchItems.indices.contains(selectedSearchIndex) else { return }
        searchItems[selectedSearchIndex].action()
    }

    func focusShortcutAction() -> String? {
        guard selectedTab == .focus, searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        guard let session = model.focusTimer.activeSession else { return "start" }
        return session.status == .paused ? "resume" : "pause"
    }

    func handleReturn() -> Bool {
        guard let action = focusShortcutAction() else { return false }
        Task {
            if action == "start" {
                await model.startFocus()
            } else {
                await model.performFocusAction(action)
            }
        }
        return true
    }

    func captureTask(_ title: String? = nil) async {
        let value = (title ?? taskCaptureText).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return }
        if await model.createTask(title: value) != nil {
            taskCaptureText = ""
            isTaskCapturing = false
            searchText = ""
        }
    }

    func toggleTask(_ task: ProductivityTask) async {
        await model.cycleTaskStatus(task)
    }

    func toggleHabit(_ row: CompanionHabitRow) async {
        if row.occurrence.status == .completed {
            await model.habitOccurrenceAction(row.occurrence, action: "undo")
        } else {
            await model.checkInHabitOccurrence(row.occurrence, value: row.habit.targetValue)
        }
    }

    func selectFocusTask(_ taskID: String?) {
        model.focusTimer.linkedTask = taskID.flatMap { id in
            focusTaskCandidates.first { $0.id == id }
        }
    }

    func openTask(_ task: ProductivityTask) {
        router.openTask(id: task.id)
        dismissCompanion()
    }

    func openSection(_ section: AppSection) {
        router.openMainWindow()
        model.selectedSection = section
        dismissCompanion()
    }

    func navigateStatusTasks() { selectTab(.tasksHabits); scrollTarget = "tasks-today" }
    func navigateStatusHabits() { selectTab(.tasksHabits); scrollTarget = "habits-today" }

    func loadTodayNote() async {
        if !noteIsDirty { await model.loadJournalNotes() }
        guard !noteIsDirty else { return }
        let note = Self.todayNote(in: model.journalNotes, day: today)
        isHydratingNote = true
        noteID = note?.id
        noteTitle = note?.title ?? "Daily note"
        noteBody = note?.contentMarkdown ?? ""
        noteSaveState = note == nil ? .idle : .saved
        isHydratingNote = false
    }

    func retryNoteSave() { Task { await flushNote() } }

    func flushNote() async {
        guard noteIsDirty else { return }
        noteSaveState = .saving
        let revision = noteRevision
        let body = noteBody
        let title = noteTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Daily note" : noteTitle
        let saved = await model.saveJournalNote(id: noteID, title: title, contentMarkdown: body, entryDate: today)
        guard let saved else { noteSaveState = .retry; return }
        noteID = saved.id
        if noteRevision == revision {
            noteIsDirty = false
            noteSaveState = .saved
        } else {
            noteSaveState = .unsaved
        }
    }

    func beginAddingCard(to deck: DeckModel) {
        cancelDeckFlow()
        addingCardDeckID = deck.id
    }

    func saveCard() async {
        let front = cardFront.trimmingCharacters(in: .whitespacesAndNewlines)
        let back = cardBack.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let deckID = addingCardDeckID, !front.isEmpty, !back.isEmpty else {
            cardValidationMessage = "Front and back are required."
            return
        }
        let deckTitle = model.decks.first(where: { $0.id == deckID })?.title ?? "Deck"
        await model.createCard(deckId: deckID, frontMarkdown: front, backMarkdown: back)
        cancelDeckFlow()
        deckMessage = "Flashcard added to \(deckTitle)."
    }

    func beginReview(_ deck: DeckModel) async {
        deckMessage = nil
        await model.loadDueCards(for: deck)
        let cards = model.cardsByDeckId[deck.id] ?? []
        guard !cards.isEmpty else { deckMessage = "No cards are due in \(deck.title)."; return }
        guard let sessionID = await model.startStudySession(deckId: deck.id) else {
            deckMessage = "Could not start this review. Try again."
            return
        }
        reviewingDeckID = deck.id
        reviewSessionID = sessionID
        reviewCards = cards
        reviewIndex = 0
        reviewRevealed = false
        reviewGrades = []
    }

    func revealReviewCard() { if reviewingDeckID != nil { reviewRevealed = true } }

    func gradeReview(_ grade: Int) async {
        guard reviewRevealed,
              (1...4).contains(grade),
              let sessionID = reviewSessionID,
              reviewCards.indices.contains(reviewIndex) else { return }
        let card = reviewCards[reviewIndex]
        let gradeName = [1: "AGAIN", 2: "HARD", 3: "GOOD", 4: "EASY"][grade]!
        await model.submitReview(sessionId: sessionID, cardId: card.id, grade: gradeName, direction: card.reviewDirection)
        reviewGrades.append(grade)
        if reviewIndex + 1 < reviewCards.count {
            reviewIndex += 1
            reviewRevealed = false
        } else {
            let average = Double(reviewGrades.reduce(0, +)) / Double(reviewGrades.count)
            await model.completeStudySession(sessionId: sessionID, rating: min(10, max(1, Int((average * 2.5).rounded()))))
            cancelDeckFlow()
            deckMessage = "Review complete."
        }
    }

    func cancelDeckFlow() {
        addingCardDeckID = nil
        cardFront = ""
        cardBack = ""
        cardValidationMessage = nil
        reviewingDeckID = nil
        reviewSessionID = nil
        reviewCards = []
        reviewIndex = 0
        reviewRevealed = false
        reviewGrades = []
    }

    private func noteDidChange() {
        guard !isHydratingNote else { return }
        noteRevision += 1
        noteIsDirty = true
        noteSaveState = .unsaved
        noteSaveTask?.cancel()
        noteSaveTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(750))
            guard !Task.isCancelled else { return }
            await self?.flushNote()
        }
    }

    static func partitionTasks(_ tasks: [ProductivityTask], day: String) -> (today: [ProductivityTask], overdue: [ProductivityTask]) {
        let visible = tasks.filter { $0.deletedAt == nil && $0.parentId == nil && $0.status != .archived && $0.status != .canceled }
        func dates(_ task: ProductivityTask) -> [Date] { [task.scheduledStartAt, task.dueAt].compactMap { $0.flatMap(iTuDateSupport.parse) } }
        let calendar = Calendar.current
        guard let dayDate = iTuDateSupport.parse(day) else { return ([], []) }
        let start = calendar.startOfDay(for: dayDate)
        let end = calendar.date(byAdding: .day, value: 1, to: start)!
        let today = visible.filter { dates($0).contains { $0 >= start && $0 < end } }
        let todayIDs = Set(today.map(\.id))
        let overdue = visible.filter { task in
            task.status != .completed && !todayIDs.contains(task.id) && dates(task).contains { $0 < start }
        }
        let sort: (ProductivityTask, ProductivityTask) -> Bool = {
            if ($0.status == .completed) != ($1.status == .completed) { return $1.status == .completed }
            if $0.important != $1.important { return $0.important }
            return $0.sortOrder < $1.sortOrder
        }
        return (today.sorted(by: sort), overdue.sorted(by: sort))
    }

    static func todayNote(in notes: [JournalNoteModel], day: String) -> JournalNoteModel? {
        notes.filter {
            $0.deletedAt == nil &&
            $0.dailyReview == nil &&
            $0.weeklyReview == nil &&
            $0.kind != "DAILY_REVIEW" &&
            $0.kind != "WEEKLY_REVIEW" &&
            iTuDateSupport.localDayString(from: $0.entryDate) == day
        }
        .max { $0.updatedAt < $1.updatedAt }
    }
}
