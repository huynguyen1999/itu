import AppKit
import SwiftUI
import XCTest
@testable import iTu

@MainActor
final class VisualLayoutTests: XCTestCase {
    func testPointerPopoverAnchorRectIsNonEmptyAtTheCapturedPoint() {
        let rect = pointerPopoverAnchorRect(at: NSPoint(x: 240, y: 180))

        XCTAssertEqual(rect.origin, NSPoint(x: 240, y: 180))
        XCTAssertEqual(rect.size, NSSize(width: 1, height: 1))
    }

    func testPlanningWorkspaceRendersAtDefaultWindowSize() throws {
        let model = AppModel()
        model.user = UserProfile(
            id: "01JVISUALTESTACCOUNT0000000",
            email: "preview@itu.local",
            username: "preview",
            displayName: "Alex Morgan",
            avatarUrl: nil,
            roles: [],
            permissions: []
        )
        model.selectedSection = .inbox
        model.tasks = previewTasks()

        let renderer = ImageRenderer(
            content: MainView()
                .environment(model)
                .frame(width: 1_220, height: 780)
        )
        renderer.scale = 1

        let image = try XCTUnwrap(renderer.nsImage)
        XCTAssertEqual(image.size.width, 1_220)
        XCTAssertEqual(image.size.height, 780)

        let tiff = try XCTUnwrap(image.tiffRepresentation)
        let representation = try XCTUnwrap(NSBitmapImageRep(data: tiff))
        let png = try XCTUnwrap(representation.representation(using: .png, properties: [:]))
        try png.write(to: FileManager.default.temporaryDirectory.appending(path: "itu-macos-planning.png"))
    }

    func testTaskEditorViewRendersWithTask() throws {
        let model = AppModel()
        var task = ProductivityTask.optimistic(
            id: "01JVISUALTASK00000000000001",
            title: "Plan quarterly learning goals",
            priority: .high,
            dueAt: ISO8601DateFormatter().string(from: Date())
        )
        task.descriptionMarkdown = "Notes about learning goals"

        let renderer = ImageRenderer(
            content: TaskEditorView(task: task, onClose: {})
                .environment(model)
                .frame(width: 580, height: 660)
        )
        renderer.scale = 1

        let image = try XCTUnwrap(renderer.nsImage)
        XCTAssertEqual(image.size.width, 580)
        XCTAssertEqual(image.size.height, 660)
    }

    func testTaskEditorOverlayResolvesTaskByID() {
        let tasks = previewTasks()
        let resolved = AppOverlayHost.resolvedTask(taskID: tasks[0].id, in: tasks)
        XCTAssertEqual(resolved?.id, tasks[0].id)
    }

    func testTaskEditorOverlayMissingOrDeletedTaskResolvesNil() {
        let tasks = previewTasks()
        XCTAssertNil(AppOverlayHost.resolvedTask(taskID: "missing-id", in: tasks))
        XCTAssertNil(AppOverlayHost.resolvedTask(taskID: nil, in: tasks))

        var deleted = previewTasks()[0]
        deleted.deletedAt = "2026-01-01T00:00:00Z"
        XCTAssertNil(AppOverlayHost.resolvedTask(taskID: deleted.id, in: [deleted]))
    }

    func testTaskEditorDraftDetectsChanges() {
        var task = previewTasks()[0]
        let stamp = ISO8601DateFormatter().string(from: Date())
        task.scheduledStartAt = stamp
        task.scheduledEndAt = stamp
        let clean = TaskEditorDraft(task: task, tagIds: [])

        XCTAssertFalse(clean.isDirty(comparedTo: task, currentTags: []))

        var editedTitle = clean
        editedTitle.title = "Changed"
        XCTAssertTrue(editedTitle.isDirty(comparedTo: task, currentTags: []))

        var editedStatus = clean
        editedStatus.status = .completed
        XCTAssertTrue(editedStatus.isDirty(comparedTo: task, currentTags: []))

        var editedTags = clean
        editedTags.tagIds = ["tag-1"]
        XCTAssertTrue(editedTags.isDirty(comparedTo: task, currentTags: []))
    }

    func testSaveInvokesModelUpdateAndClose() async throws {
        let tempDir = FileManager.default
            .urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tempDir) }

        let model = AppModel()
        let store = OfflineStore(accountID: "editor-save-test", baseURL: tempDir)
        _ = try await store.load()
        let (task, snapshot) = try await store.createTask(title: "Original title")
        model.offlineStore = store
        model.apply(snapshot)

        let edits = TaskEdits(
            title: "Updated title",
            descriptionMarkdown: "",
            priority: .high,
            important: true,
            dueAt: nil,
            estimatedMinutes: nil
        )

        var closed = false
        let view = TaskEditorView(task: task, onClose: { closed = true })
        view.commitSave(edits: edits, status: task.status, task: task, model: model, onClose: { closed = true })
        XCTAssertTrue(closed)

        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(model.tasks.first(where: { $0.id == task.id })?.title, "Updated title")
    }

    func testDeleteAndStartFocusCloseOnlyTheEditor() {
        let model = AppModel()
        let task = previewTasks()[0]
        model.tasks = [task]

        var deleteClosed = false
        TaskEditorView(task: task, onClose: {})
            .deleteTask(task: task, model: model, onClose: { deleteClosed = true })
        XCTAssertTrue(deleteClosed)

        var focusClosed = false
        TaskEditorView(task: task, onClose: {})
            .startFocus(task: task, model: model, onClose: { focusClosed = true })
        XCTAssertTrue(focusClosed)
    }

    func testSharedTaskActionMenuRenders() throws {
        let model = AppModel()
        let task = previewTasks()[0]

        let renderer = ImageRenderer(
            content: TaskContextMenuPopoverView(
                task: task,
                onDismiss: {},
                onOpenDetail: {}
            )
            .environment(model)
        )
        renderer.scale = 1

        let image = try XCTUnwrap(renderer.nsImage)
        XCTAssertEqual(image.size.width, 320)
        XCTAssertGreaterThan(image.size.height, 0)
    }

    func testGrowthReceiptOverlayKeepsLongRewardNamesInCompactLayout() throws {
        let reward = GrowthItemAward(
            itemId: "item-visual",
            name: "A reward with a deliberately long name",
            icon: "gift",
            color: "mint",
            quantity: 1,
            inventoryQuantityAfter: 1
        )
        let receipt = GrowthAwardReceipt(
            sourceType: .task,
            sourceId: "task-visual",
            title: "Complete the long-form planning task without losing the thread",
            itemAwards: [reward]
        )
        let renderer = ImageRenderer(
            content: GrowthReceiptOverlay(
                presented: PresentedGrowthReceipt(id: "receipt-visual", receipt: receipt),
                dismiss: {}
            )
        )
        renderer.scale = 1

        let image = try XCTUnwrap(renderer.nsImage)
        XCTAssertEqual(image.size.width, 370)
        XCTAssertGreaterThan(image.size.height, 0)
    }

    func testRewardChipsWrapInsteadOfCompressingAtNarrowWidth() throws {
        let renderer = ImageRenderer(
            content: WrappingHStack(horizontalSpacing: 6, verticalSpacing: 5) {
                rewardChip("+25 XP")
                rewardChip("+15")
                rewardChip("+6")
                rewardChip("+2 Coins")
            }
            .frame(width: 180, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
        )
        renderer.scale = 1

        let image = try XCTUnwrap(renderer.nsImage)
        XCTAssertEqual(image.size.width, 180)
        XCTAssertGreaterThan(image.size.height, 26)
    }

    func testCalendarWeekViewRendersWithDayHeaders() throws {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let days = (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: today) }
        let items: [CalendarItem] = [
            CalendarItem(
                id: "item-1",
                title: "Planning session",
                start: today.addingTimeInterval(3600 * 9),
                end: today.addingTimeInterval(3600 * 10),
                kind: "TASK_DURATION",
                taskID: "task-1",
                readOnly: false,
                allDay: false,
                sourceID: "inbox",
                sourceName: "Inbox",
                color: nil,
                priority: "high"
            ),
            CalendarItem(
                id: "item-allday-1",
                title: "Sprint Review Milestone",
                start: days[2],
                end: days[2].addingTimeInterval(86400),
                kind: "TASK_DUE",
                taskID: "task-2",
                readOnly: false,
                allDay: true,
                dueAt: days[2].addingTimeInterval(3600 * 17),
                sourceID: "inbox",
                sourceName: "Inbox",
                color: nil,
                priority: "high"
            ),
            CalendarItem(
                id: "item-spanning-1",
                title: "Offsite Workshop",
                start: days[3].addingTimeInterval(3600 * 9),
                end: days[5].addingTimeInterval(3600 * 17),
                kind: "EXTERNAL_EVENT",
                taskID: nil,
                readOnly: true,
                allDay: false,
                sourceID: "calendar:team",
                sourceName: "Team",
                color: "TEAL",
                priority: nil
            )
        ]

        let renderer = ImageRenderer(
            content: CalendarWeekView(
                days: days,
                items: items,
                onSelect: { _ in },
                onScheduleUpdate: { _, _, _ in }
            )
            .frame(width: 1220, height: 700)
        )
        renderer.scale = 1

        let image = try XCTUnwrap(renderer.nsImage)
        XCTAssertEqual(image.size.width, 1220)
        XCTAssertEqual(image.size.height, 700)
    }

    func testCalendarDayViewRendersWithDayHeader() throws {
        let today = Calendar.current.startOfDay(for: Date())
        let items: [CalendarItem] = [
            CalendarItem(
                id: "item-day-1",
                title: "Daily sync",
                start: today.addingTimeInterval(3600 * 10),
                end: today.addingTimeInterval(3600 * 11),
                kind: "TASK_DURATION",
                taskID: "task-day-1",
                readOnly: false,
                allDay: false,
                sourceID: "inbox",
                sourceName: "Inbox",
                color: nil,
                priority: "high"
            )
        ]

        let renderer = ImageRenderer(
            content: CalendarDayView(
                day: today,
                items: items,
                onSelect: { _ in },
                onScheduleUpdate: { _, _, _ in }
            )
            .frame(width: 800, height: 700)
        )
        renderer.scale = 1

        let image = try XCTUnwrap(renderer.nsImage)
        XCTAssertEqual(image.size.width, 800)
        XCTAssertEqual(image.size.height, 700)
    }

    private func rewardChip(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 10, weight: .bold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(iTuTheme.mintTint)
            .clipShape(Capsule())
            .fixedSize()
    }

    private func previewTasks() -> [ProductivityTask] {
        var first = ProductivityTask.optimistic(
            id: "01JVISUALTASK00000000000001",
            title: "Prepare the weekly plan",
            priority: .high,
            dueAt: ISO8601DateFormatter().string(from: Date())
        )
        first.important = true
        first.estimatedMinutes = 35

        var second = ProductivityTask.optimistic(
            id: "01JVISUALTASK00000000000002",
            title: "Review focus notes",
            priority: .medium
        )
        second.estimatedMinutes = 20

        var third = ProductivityTask.optimistic(
            id: "01JVISUALTASK00000000000003",
            title: "Organize the learning backlog"
        )
        third.status = .completed

        return [first, second, third]
    }
}
