import AppIntents

@available(iOS 17.0, *)
struct CreateTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Create Task"
    static let openAppWhenRun = true

    @Parameter(title: "Title")
    var title: String

    func perform() async throws -> some IntentResult {
        try await IOSProductivityIntentExecutor.createTask(title: title)
        return .result()
    }
}

@available(iOS 17.0, *)
struct CompleteTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Complete Task"
    static let openAppWhenRun = true

    @Parameter(title: "Task ID")
    var taskID: String

    func perform() async throws -> some IntentResult {
        try await IOSProductivityIntentExecutor.completeTask(id: taskID)
        return .result()
    }
}

@available(iOS 17.0, *)
struct CompleteHabitIntent: AppIntent {
    static let title: LocalizedStringResource = "Complete Habit"
    static let openAppWhenRun = true

    @Parameter(title: "Habit ID")
    var habitID: String

    func perform() async throws -> some IntentResult {
        try await IOSProductivityIntentExecutor.completeHabit(id: habitID)
        return .result()
    }
}

@available(iOS 17.0, *)
struct IncrementHabitIntent: AppIntent {
    static let title: LocalizedStringResource = "Increment Habit"
    static let openAppWhenRun = true

    @Parameter(title: "Habit ID")
    var habitID: String

    func perform() async throws -> some IntentResult {
        try await IOSProductivityIntentExecutor.incrementHabit(id: habitID)
        return .result()
    }
}
