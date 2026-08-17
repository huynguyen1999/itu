import AppIntents

@available(iOS 17.0, *)
struct StartFocusIntent: AppIntent {
    static let title: LocalizedStringResource = "Start Focus"
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        _ = try await IOSFocusIntentExecutor.start()
        return .result()
    }
}

@available(iOS 17.0, *)
struct PauseFocusIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Pause Focus"

    func perform() async throws -> some IntentResult {
        _ = try await IOSFocusIntentExecutor.execute(.pause)
        return .result()
    }
}

@available(iOS 17.0, *)
struct ResumeFocusIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Resume Focus"

    func perform() async throws -> some IntentResult {
        _ = try await IOSFocusIntentExecutor.execute(.resume)
        return .result()
    }
}

@available(iOS 17.0, *)
struct CompleteFocusIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Finish Focus"

    func perform() async throws -> some IntentResult {
        _ = try await IOSFocusIntentExecutor.execute(.complete)
        return .result()
    }
}
