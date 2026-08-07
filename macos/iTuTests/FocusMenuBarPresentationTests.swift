import XCTest
import SwiftUI
@testable import iTu

@MainActor
final class FocusMenuBarPresentationTests: XCTestCase {

    func testPhaseStyleMapping() {
        let workStyle = FocusPhase.work.menuBarStyle
        XCTAssertEqual(workStyle.accent, iTuTheme.teal)
        XCTAssertNil(workStyle.centerSymbolName)
        XCTAssertEqual(workStyle.accessibilityName, "Focus")

        let shortBreakStyle = FocusPhase.shortBreak.menuBarStyle
        XCTAssertEqual(shortBreakStyle.accent, iTuTheme.amber)
        XCTAssertEqual(shortBreakStyle.centerSymbolName, "cup.and.saucer.fill")
        XCTAssertEqual(shortBreakStyle.accessibilityName, "Short break")

        let longBreakStyle = FocusPhase.longBreak.menuBarStyle
        XCTAssertEqual(longBreakStyle.accent, iTuTheme.coral)
        XCTAssertEqual(longBreakStyle.centerSymbolName, "moon.fill")
        XCTAssertEqual(longBreakStyle.accessibilityName, "Long break")
    }

    func testProgressSteppingQuantization() {
        func computeStep(_ progressFraction: Double) -> Double {
            let clampedProgress = min(max(progressFraction, 0), 1)
            if clampedProgress >= 1.0 {
                return 1.0
            } else {
                return floor(clampedProgress * 50) / 50
            }
        }

        XCTAssertEqual(computeStep(0.0), 0.0)
        XCTAssertEqual(computeStep(0.019), 0.0)
        XCTAssertEqual(computeStep(0.02), 0.02)
        XCTAssertEqual(computeStep(0.039), 0.02)
        XCTAssertEqual(computeStep(0.50), 0.50)
        XCTAssertEqual(computeStep(0.999), 0.98)
        XCTAssertEqual(computeStep(1.0), 1.0)
        XCTAssertEqual(computeStep(-0.1), 0.0)
        XCTAssertEqual(computeStep(1.5), 1.0)
    }

    func testMenuBarIconCacheReusesImagesForSameState() {
        let cache = MenuBarIconCache.shared

        let image1 = cache.icon(
            progressFraction: 0.10,
            isPaused: false,
            isOvertime: false,
            phase: .work,
            colorScheme: .dark
        )

        let image2 = cache.icon(
            progressFraction: 0.11, // Still within 0.10 step
            isPaused: false,
            isOvertime: false,
            phase: .work,
            colorScheme: .dark
        )

        XCTAssertTrue(image1 === image2, "Images within the same 2% boundary should be identical cached instance")
    }

    func testMenuBarIconCacheDifferentiatesPhasesAndStates() {
        let cache = MenuBarIconCache.shared

        let workImage = cache.icon(
            progressFraction: 0.50,
            isPaused: false,
            isOvertime: false,
            phase: .work,
            colorScheme: .dark
        )

        let shortBreakImage = cache.icon(
            progressFraction: 0.50,
            isPaused: false,
            isOvertime: false,
            phase: .shortBreak,
            colorScheme: .dark
        )

        let pausedImage = cache.icon(
            progressFraction: 0.50,
            isPaused: true,
            isOvertime: false,
            phase: .work,
            colorScheme: .dark
        )

        let lightSchemeImage = cache.icon(
            progressFraction: 0.50,
            isPaused: false,
            isOvertime: false,
            phase: .work,
            colorScheme: .light
        )

        XCTAssertFalse(workImage === shortBreakImage, "Work and Short Break icons must not share cache entry")
        XCTAssertFalse(workImage === pausedImage, "Running and Paused icons must not share cache entry")
        XCTAssertFalse(workImage === lightSchemeImage, "Dark and Light color scheme icons must not share cache entry")
    }

    func testSnapshotProgressQuantizationEquivalence() {
        let model = AppModel()
        var session = FocusSession.optimistic(
            id: "s-1",
            task: nil,
            phase: .work,
            plannedSeconds: 1800,
            startedAt: "2026-08-07T00:00:00Z"
        )
        session.status = .paused
        session.pausedAt = "2026-08-07T00:01:00Z" // 60s elapsed -> step = 1 (progress = 0.0333)

        model.focusTimer.apply(active: session)
        let snapshot1 = MenuBarStatusPresentation.snapshot(model: model, appearance: .dark)

        // Change pausedAt slightly by 10s (70s elapsed -> step still 1 since 70/1800 * 50 = 1.94 -> floor = 1)
        session.pausedAt = "2026-08-07T00:01:10Z"
        model.focusTimer.apply(active: session)
        let snapshot2 = MenuBarStatusPresentation.snapshot(model: model, appearance: .dark)

        XCTAssertEqual(snapshot1, snapshot2, "Snapshots with same progressStep must compare as equal")

        // Jump pausedAt to crossing boundary (e.g. 100s elapsed -> 100/1800 * 50 = 2.77 -> floor = 2)
        session.pausedAt = "2026-08-07T00:01:40Z"
        model.focusTimer.apply(active: session)
        let snapshot3 = MenuBarStatusPresentation.snapshot(model: model, appearance: .dark)

        XCTAssertNotEqual(snapshot1, snapshot3, "Snapshots crossing progressStep boundary must not compare equal")
    }
}
