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
            content: TaskEditorView(task: task)
                .environment(model)
                .frame(width: 580, height: 660)
        )
        renderer.scale = 1

        let image = try XCTUnwrap(renderer.nsImage)
        XCTAssertEqual(image.size.width, 580)
        XCTAssertEqual(image.size.height, 660)
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
                rewardChip("+25 Account XP")
                rewardChip("+15 Skill XP · 60%")
                rewardChip("+6 Skill XP · 25%")
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
