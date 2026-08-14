import XCTest
@testable import iTu

@MainActor
final class CompanionTests: XCTestCase {
    private var model: AppModel!
    private var router: AppNavigationRouter!
    private var viewModel: CompanionViewModel!

    override func setUp() async throws {
        try await super.setUp()
        model = AppModel()
        router = AppNavigationRouter(model: model, openMainWindow: {})
        viewModel = CompanionViewModel(model: model, router: router, dismissCompanion: {})
    }

    override func tearDown() async throws {
        viewModel = nil
        router = nil
        model = nil
        try await super.tearDown()
    }

    func testPresentationResetsToTasksAndHabits() {
        viewModel.selectedTab = .deck
        viewModel.searchText = "budget"
        viewModel.isTaskCapturing = true
        viewModel.resetForPresentation()

        XCTAssertEqual(viewModel.selectedTab, .tasksHabits)
        XCTAssertTrue(viewModel.searchText.isEmpty)
        XCTAssertFalse(viewModel.isTaskCapturing)
    }

    func testCommandNumberMappingIsStable() {
        XCTAssertEqual(CompanionTab.tasksHabits.rawValue, 1)
        XCTAssertEqual(CompanionTab.note.rawValue, 2)
        XCTAssertEqual(CompanionTab.focus.rawValue, 3)
        XCTAssertEqual(CompanionTab.deck.rawValue, 4)
    }

    func testFocusReturnShortcutChoosesStartPauseOrResume() {
        XCTAssertNil(viewModel.focusShortcutAction())

        viewModel.selectedTab = .focus
        XCTAssertEqual(viewModel.focusShortcutAction(), "start")

        var session = FocusSession.optimistic(id: "focus", task: nil, phase: .work, plannedSeconds: 1_800, startedAt: "2026-08-09T00:00:00Z")
        model.focusTimer.activeSession = session
        XCTAssertEqual(viewModel.focusShortcutAction(), "pause")

        session.status = .paused
        model.focusTimer.activeSession = session
        XCTAssertEqual(viewModel.focusShortcutAction(), "resume")
    }

    func testCompanionPanelHidesWhenApplicationDeactivates() {
        let panel = CompanionPanel(contentRect: NSRect(x: 0, y: 0, width: 650, height: 520))
        XCTAssertTrue(panel.hidesOnDeactivate)
    }

    func testTabSwitchClearsSearchAndNestedFlow() {
        let deck = DeckModel(id: "deck", title: "Swift", description: "", cardCount: 1, dueCount: 1, color: "teal", icon: "book")
        viewModel.searchText = "swift"
        viewModel.beginAddingCard(to: deck)

        viewModel.selectTab(.focus)

        XCTAssertTrue(viewModel.searchText.isEmpty)
        XCTAssertNil(viewModel.addingCardDeckID)
        XCTAssertEqual(viewModel.selectedTab, .focus)
    }

    func testEscapeCancelsInnerStateBeforePanelClose() {
        viewModel.searchText = "task"
        XCTAssertTrue(viewModel.handleEscape())
        XCTAssertTrue(viewModel.searchText.isEmpty)

        viewModel.isTaskCapturing = true
        viewModel.taskCaptureText = "Draft"
        XCTAssertTrue(viewModel.handleEscape())
        XCTAssertFalse(viewModel.isTaskCapturing)

        XCTAssertFalse(viewModel.handleEscape())
    }

    func testSearchSelectionWraps() {
        viewModel.searchText = "open"
        XCTAssertFalse(viewModel.searchItems.isEmpty)
        viewModel.selectedSearchIndex = 0
        viewModel.moveSearchSelection(-1)
        XCTAssertEqual(viewModel.selectedSearchIndex, viewModel.searchItems.count - 1)
        viewModel.moveSearchSelection(1)
        XCTAssertEqual(viewModel.selectedSearchIndex, 0)
    }

    func testTaskProjectionIncludesCompletedTodayAndSeparatesOverdue() {
        let day = "2026-08-09"
        let tasks = [
            task("today", dueAt: "2026-08-09", status: .inbox),
            task("done", dueAt: "2026-08-09", status: .completed),
            task("overdue", dueAt: "2026-08-08", status: .planned),
            task("nested", parentID: "today", dueAt: "2026-08-09", status: .inbox),
            task("canceled", dueAt: "2026-08-09", status: .canceled)
        ]

        let result = CompanionViewModel.partitionTasks(tasks, day: day)

        XCTAssertEqual(Set(result.today.map(\.id)), ["today", "done"])
        XCTAssertEqual(result.overdue.map(\.id), ["overdue"])
    }

    func testTodayTaskMatchesEitherScheduledOrDueDate() {
        let task = task("mixed", scheduledAt: "2026-08-08", dueAt: "2026-08-09", status: .planned)
        let result = CompanionViewModel.partitionTasks([task], day: "2026-08-09")
        XCTAssertEqual(result.today.map(\.id), ["mixed"])
        XCTAssertTrue(result.overdue.isEmpty)
    }

    func testPlannedTaskMovesToInProgressFromCompanion() async {
        let task = task("planned", status: .planned)
        _ = try? await model.offlineStore.applyHydration(AccountHydrationResources(tasks: [task]))
        model.tasks = [task]

        await viewModel.toggleTask(task)

        XCTAssertEqual(model.tasks.first?.status, .inProgress)
    }

    func testLivingNoteUsesNewestDuplicateForLocalDay() {
        let notes = [
            note("old", entryDate: "2026-08-09", updatedAt: "2026-08-09T08:00:00Z"),
            note("new", entryDate: "2026-08-09", updatedAt: "2026-08-09T09:00:00Z"),
            note("other", entryDate: "2026-08-08", updatedAt: "2026-08-09T10:00:00Z")
        ]
        XCTAssertEqual(CompanionViewModel.todayNote(in: notes, day: "2026-08-09")?.id, "new")
    }

    func testDecksSortDueFirstThenAlphabetically() {
        model.decks = [
            DeckModel(id: "z", title: "Zulu", description: "", cardCount: 1, dueCount: 0, color: "teal", icon: "book"),
            DeckModel(id: "a", title: "Alpha", description: "", cardCount: 2, dueCount: 3, color: "teal", icon: "book"),
            DeckModel(id: "b", title: "Beta", description: "", cardCount: 2, dueCount: 7, color: "teal", icon: "book")
        ]
        XCTAssertEqual(viewModel.sortedDecks.map(\.id), ["b", "a", "z"])
    }

    func testFlashcardCreationRequiresFrontAndBack() async {
        let deck = DeckModel(id: "deck", title: "Swift", description: "", cardCount: 0, dueCount: 0, color: "teal", icon: "book")
        viewModel.beginAddingCard(to: deck)
        viewModel.cardFront = "Question"

        await viewModel.saveCard()

        XCTAssertEqual(viewModel.cardValidationMessage, "Front and back are required.")
        XCTAssertEqual(viewModel.addingCardDeckID, deck.id)
    }

    func testFocusTaskSelectionIncludesActiveUnscheduledTasks() {
        let unscheduled = task("unscheduled", status: .inbox)
        let completed = task("completed", dueAt: viewModel.today, status: .completed)
        model.tasks = [completed, unscheduled]

        XCTAssertEqual(viewModel.focusTaskCandidates.map(\.id), ["unscheduled"])
        viewModel.selectFocusTask("unscheduled")
        XCTAssertEqual(model.focusTimer.linkedTask?.id, "unscheduled")
        viewModel.selectFocusTask(nil)
        XCTAssertNil(model.focusTimer.linkedTask)
    }

    func testDailyStatusUsesScheduledOccurrencesAndDueCards() {
        let day = viewModel.today
        model.tasks = [task("today", dueAt: day, status: .completed), task("old", dueAt: "2000-01-01", status: .inbox)]
        model.habits = [HabitModel(id: "habit", name: "Read")]
        model.habitOccurrences = [HabitOccurrenceModel(id: "occurrence", habitId: "habit", occurrenceDate: day, status: .completed, value: 1)]
        model.decks = [DeckModel(id: "deck", title: "Swift", description: "", cardCount: 8, dueCount: 5, color: "teal", icon: "book")]

        XCTAssertEqual(viewModel.dailyStatus.taskCount, 1)
        XCTAssertEqual(viewModel.dailyStatus.habitCount, 1)
        XCTAssertEqual(viewModel.dailyStatus.dueCardCount, 5)
    }

    private func task(
        _ id: String,
        parentID: String? = nil,
        scheduledAt: String? = nil,
        dueAt: String? = nil,
        status: TaskStatus
    ) -> ProductivityTask {
        ProductivityTask(
            id: id,
            taskListId: "inbox",
            parentId: parentID,
            title: id,
            descriptionMarkdown: "",
            priority: .none,
            important: false,
            urgent: false,
            urgencyReason: "",
            scheduledStartAt: scheduledAt,
            dueAt: dueAt,
            status: status,
            sortOrder: 1,
            version: 1
        )
    }

    private func note(_ id: String, entryDate: String, updatedAt: String) -> JournalNoteModel {
        JournalNoteModel(id: id, userId: "user", kind: "DAILY", title: id, contentMarkdown: "", entryDate: entryDate, updatedAt: updatedAt)
    }
}
