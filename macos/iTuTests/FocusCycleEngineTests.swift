import XCTest
@testable import iTu

@MainActor
final class FocusCycleEngineTests: XCTestCase {
    func testWorkSessionsIncrementCycleUntilLongBreak() {
        let engine = FocusCycleEngine()
        engine.configure(cyclesBeforeLongBreak: 4)

        XCTAssertEqual(engine.currentCycle, 1)
        XCTAssertEqual(engine.nextPhase, .shortBreak)

        engine.handleSessionCompleted(phase: .work, isManual: false)
        XCTAssertEqual(engine.completedWorkCount, 1)
        XCTAssertEqual(engine.currentCycle, 2)
        XCTAssertEqual(engine.nextPhase, .shortBreak)

        engine.handleSessionCompleted(phase: .work, isManual: false)
        XCTAssertEqual(engine.completedWorkCount, 2)
        XCTAssertEqual(engine.currentCycle, 3)

        engine.handleSessionCompleted(phase: .work, isManual: false)
        XCTAssertEqual(engine.completedWorkCount, 3)
        XCTAssertEqual(engine.currentCycle, 4)

        engine.handleSessionCompleted(phase: .work, isManual: false)
        XCTAssertEqual(engine.completedWorkCount, 4)
        XCTAssertEqual(engine.nextPhase, .longBreak)
    }

    func testManualShortBreakDoesNotChangeCycleProgress() {
        let engine = FocusCycleEngine()
        engine.configure(cyclesBeforeLongBreak: 4)
        engine.handleSessionCompleted(phase: .work, isManual: false)

        engine.handleManualShortBreakStarted()
        XCTAssertEqual(engine.completedWorkCount, 1)
        XCTAssertEqual(engine.currentCycle, 2)
    }

    func testManualLongBreakDoesNotResetCycleProgress() {
        let engine = FocusCycleEngine()
        engine.configure(cyclesBeforeLongBreak: 4)
        engine.handleSessionCompleted(phase: .work, isManual: false)
        engine.handleSessionCompleted(phase: .work, isManual: false)

        engine.handleManualLongBreakStarted()
        XCTAssertEqual(engine.completedWorkCount, 2)
        XCTAssertEqual(engine.currentCycle, 3)
    }

    func testCompletedLongBreakResetsCycle() {
        let engine = FocusCycleEngine()
        engine.configure(cyclesBeforeLongBreak: 4)
        for _ in 0..<4 {
            engine.handleSessionCompleted(phase: .work, isManual: false)
        }
        XCTAssertEqual(engine.nextPhase, .longBreak)

        engine.handleSessionCompleted(phase: .longBreak, isManual: false)
        XCTAssertEqual(engine.completedWorkCount, 0)
        XCTAssertEqual(engine.currentCycle, 1)
    }
}
