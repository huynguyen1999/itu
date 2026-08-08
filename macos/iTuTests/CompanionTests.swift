import XCTest
@testable import iTu

@MainActor
final class CompanionTests: XCTestCase {
    var model: AppModel!
    var router: AppNavigationRouter!
    var dismissCalled = false

    override func setUp() {
        super.setUp()
        model = AppModel()
        router = AppNavigationRouter(model: model, openMainWindow: {})
        dismissCalled = false
    }

    override func tearDown() {
        model = nil
        router = nil
        super.tearDown()
    }

    func testViewModelDefaultListWhenEmpty() {
        let viewModel = CompanionViewModel(model: model, router: router) {
            self.dismissCalled = true
        }

        // Search text is empty on start
        XCTAssertTrue(viewModel.searchText.isEmpty)

        // Verify NEXT section has a placeholder when no tasks
        let nextItems = viewModel.items.filter { $0.section == .next }
        XCTAssertTrue(nextItems.contains { $0.title == "All caught up!" })

        // Verify HABITS section has a placeholder when no habits
        let habitsItems = viewModel.items.filter { $0.section == .habits }
        XCTAssertTrue(habitsItems.contains { $0.title == "No active habits" })

        // Verify FOCUS section has idle controls
        let focusItems = viewModel.items.filter { $0.section == .focus }
        XCTAssertTrue(focusItems.contains { $0.title == "No active session" })
        XCTAssertTrue(focusItems.contains { $0.title == "Start Focus" })
    }

    func testViewModelSearchRankingAndFiltering() {
        let viewModel = CompanionViewModel(model: model, router: router) {
            self.dismissCalled = true
        }

        // Add mock tasks
        model.tasks = [
            ProductivityTask(
                id: "1",
                taskListId: "inbox",
                title: "Review gym budget",
                descriptionMarkdown: "",
                priority: .high,
                important: true,
                urgent: false,
                urgencyReason: "",
                status: .inbox,
                sortOrder: 1.0,
                version: 1
            ),
            ProductivityTask(
                id: "2",
                taskListId: "inbox",
                title: "Water plants",
                descriptionMarkdown: "",
                priority: .none,
                important: false,
                urgent: false,
                urgencyReason: "",
                status: .inbox,
                sortOrder: 2.0,
                version: 1
            ),
            ProductivityTask(
                id: "3",
                taskListId: "inbox",
                title: "Budget tracking setup",
                descriptionMarkdown: "",
                priority: .none,
                important: false,
                urgent: false,
                urgencyReason: "",
                status: .inbox,
                sortOrder: 3.0,
                version: 1
            )
        ]

        // Type query
        viewModel.searchText = "budget"

        // Result list should group tasks under .tasks
        let taskItems = viewModel.items.filter { $0.section == .tasks }
        XCTAssertEqual(taskItems.count, 2)
        XCTAssertTrue(taskItems.contains { $0.title == "Review gym budget" })
        XCTAssertTrue(taskItems.contains { $0.title == "Budget tracking setup" })

        // Result list should include quick capture option
        let captureItems = viewModel.items.filter { $0.section == .quickCapture }
        XCTAssertEqual(captureItems.count, 1)
        XCTAssertTrue(captureItems.first?.title.contains("Create task") == true)
    }

    func testViewModelKeyboardNavigationClamping() {
        let viewModel = CompanionViewModel(model: model, router: router) {
            self.dismissCalled = true
        }

        XCTAssertGreaterThan(viewModel.items.count, 0)

        // Reset index
        viewModel.resetSelection()
        XCTAssertEqual(viewModel.selectedIndex, 0)

        // Go up should wrap to the end of items
        viewModel.moveSelectionUp()
        XCTAssertEqual(viewModel.selectedIndex, viewModel.items.count - 1)

        // Go down should wrap back to 0
        viewModel.moveSelectionDown()
        XCTAssertEqual(viewModel.selectedIndex, 0)
    }

    func testViewModelSectionNavigationJumps() {
        let viewModel = CompanionViewModel(model: model, router: router) {
            self.dismissCalled = true
        }

        viewModel.resetSelection()
        XCTAssertEqual(viewModel.items[viewModel.selectedIndex].section, .next)

        // Jumps from .next to .habits
        viewModel.selectNextSection()
        XCTAssertEqual(viewModel.items[viewModel.selectedIndex].section, .habits)
        
        // Jumps from .habits to .focus
        viewModel.selectNextSection()
        XCTAssertEqual(viewModel.items[viewModel.selectedIndex].section, .focus)
    }

    func testViewModelDirectIndexSelection() {
        let viewModel = CompanionViewModel(model: model, router: router) {
            self.dismissCalled = true
        }

        // Select the second item
        viewModel.selectItem(at: 1)
        XCTAssertEqual(viewModel.selectedIndex, 1)
    }

    func testFocusActionRetainsCompanionOpenState() {
        let viewModel = CompanionViewModel(model: model, router: router) {
            self.dismissCalled = true
        }

        // Find Start Focus item
        if let startIndex = viewModel.items.firstIndex(where: { $0.id == "focus-start" }) {
            viewModel.selectedIndex = startIndex
            viewModel.executeSelection()
            
            // Verify dismiss was NOT called
            XCTAssertFalse(self.dismissCalled)
        }
    }
}
