import Foundation

extension APIClient {
    // MARK: - Habits

    func fetchHabits() async throws -> [HabitModel] {
        try await request(path: "/productivity/habits")
    }

    func fetchHabitTimeBlocks() async throws -> [HabitTimeBlockModel] {
        try await request(path: "/productivity/habit-time-blocks")
    }

    func createHabitTimeBlock(name: String) async throws -> HabitTimeBlockModel {
        try await request(
            path: "/productivity/habit-time-blocks",
            method: "POST",
            body: [
                "name": .string(name),
                "icon": .string("ListChecks"),
                "color": .string("SLATE"),
                "startLocal": .string("00:00"),
                "endLocal": .string("23:59")
            ] as [String: JSONValue]
        )
    }

    func fetchHabitOccurrences(from: String, to: String) async throws -> [HabitOccurrenceModel] {
        try await request(path: "/productivity/habit-occurrences?from=\(from)&to=\(to)")
    }

    func fetchHabitStats(id: String) async throws -> HabitStatsModel {
        try await request(path: "/productivity/habits/\(id)/stats")
    }

    func checkInHabitOccurrence(id: String, value: Double, idempotencyKey: String) async throws -> HabitOccurrenceModel {
        try await request(
            path: "/productivity/habit-occurrences/\(id)/check-in",
            method: "POST",
            body: [
                "value": .number(value),
                "idempotencyKey": .string(idempotencyKey)
            ] as [String: JSONValue]
        )
    }

    func habitOccurrenceAction(
        id: String,
        action: String,
        idempotencyKey: String = ULID.generate()
    ) async throws -> HabitOccurrenceModel {
        try await request(
            path: "/productivity/habit-occurrences/\(id)/\(action)",
            method: "POST",
            body: ["idempotencyKey": .string(idempotencyKey)] as [String: JSONValue]
        )
    }

    func checkInHabit(id: String) async throws -> HabitModel {
        try await request(path: "/productivity/habits/\(id)/check-in", method: "POST")
    }
}
