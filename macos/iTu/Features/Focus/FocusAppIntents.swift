import Foundation
import AppIntents

struct StartFocusIntent: AppIntent {
    static var title: LocalizedStringResource { "Start Focus Session" }
    static var description: IntentDescription { IntentDescription("Starts a focus session with optional custom title and duration.") }

    @Parameter(title: "Title")
    var customTitle: String?

    @Parameter(title: "Duration (Minutes)", default: 30)
    var durationMinutes: Int?

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let plannedSecs = (durationMinutes ?? 30) * 60
        let session = FocusCommandService.shared.startFocus(customTitle: customTitle, plannedSeconds: plannedSecs)
        return .result(value: session.id)
    }
}

struct StartShortBreakIntent: AppIntent {
    static var title: LocalizedStringResource { "Start Short Break" }
    static var description: IntentDescription { IntentDescription("Starts a short break session.") }

    @Parameter(title: "Duration (Minutes)", default: 5)
    var durationMinutes: Int?

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let plannedSecs = (durationMinutes ?? 5) * 60
        let session = FocusCommandService.shared.startShortBreak(plannedSeconds: plannedSecs)
        return .result(value: session.id)
    }
}

struct StartLongBreakIntent: AppIntent {
    static var title: LocalizedStringResource { "Start Long Break" }
    static var description: IntentDescription { IntentDescription("Starts a long break session.") }

    @Parameter(title: "Duration (Minutes)", default: 15)
    var durationMinutes: Int?

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let plannedSecs = (durationMinutes ?? 15) * 60
        let session = FocusCommandService.shared.startLongBreak(plannedSeconds: plannedSecs)
        return .result(value: session.id)
    }
}

struct PauseFocusIntent: AppIntent {
    static var title: LocalizedStringResource { "Pause Focus Session" }
    static var description: IntentDescription { IntentDescription("Pauses the currently active focus session.") }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<Bool> {
        let session = FocusCommandService.shared.pause()
        return .result(value: session != nil)
    }
}

struct ResumeFocusIntent: AppIntent {
    static var title: LocalizedStringResource { "Resume Focus Session" }
    static var description: IntentDescription { IntentDescription("Resumes a paused focus session.") }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<Bool> {
        let session = FocusCommandService.shared.resume()
        return .result(value: session != nil)
    }
}

struct CompleteFocusIntent: AppIntent {
    static var title: LocalizedStringResource { "Complete Focus Session" }
    static var description: IntentDescription { IntentDescription("Completes the active focus session.") }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<Bool> {
        let session = FocusCommandService.shared.complete()
        return .result(value: session != nil)
    }
}

struct AbandonFocusIntent: AppIntent {
    static var title: LocalizedStringResource { "Abandon Focus Session" }
    static var description: IntentDescription { IntentDescription("Abandons the active focus session.") }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<Bool> {
        let session = FocusCommandService.shared.abandon()
        return .result(value: session != nil)
    }
}

struct GetRemainingSecondsIntent: AppIntent {
    static var title: LocalizedStringResource { "Get Remaining Seconds" }
    static var description: IntentDescription { IntentDescription("Returns the remaining seconds of the active focus session.") }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<Int> {
        let remaining = FocusCommandService.shared.getRemainingSeconds()
        return .result(value: remaining)
    }
}

struct GetSessionTitleIntent: AppIntent {
    static var title: LocalizedStringResource { "Get Session Title" }
    static var description: IntentDescription { IntentDescription("Returns the title of the active focus session.") }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let title = FocusCommandService.shared.getSessionTitle()
        return .result(value: title)
    }
}

struct GetFocusStateIntent: AppIntent {
    static var title: LocalizedStringResource { "Get Focus State" }
    static var description: IntentDescription { IntentDescription("Returns current status, phase, and timing for the active focus session.") }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let state = FocusCommandService.shared.getFocusState()
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let data = (try? encoder.encode(state)) ?? Data()
        let jsonString = String(data: data, encoding: .utf8) ?? "{}"
        return .result(value: jsonString)
    }
}
