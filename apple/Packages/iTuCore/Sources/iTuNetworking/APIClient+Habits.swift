import Foundation
import iTuDomain

public extension APIClient {
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

    func fetchHabitCalendar(from: String, to: String, habitId: String? = nil) async throws -> HabitCalendarResponse {
        var path = "/productivity/habits/calendar?from=\(from)&to=\(to)"
        if let habitId { path += "&habitId=\(habitId)" }
        return try await request(path: path)
    }

    func fetchHabitStats(id: String) async throws -> HabitStatsModel {
        try await request(path: "/productivity/habits/\(id)/stats")
    }

    func fetchHabitInsights(id: String, from: String, to: String) async throws -> HabitStatsModel {
        try await request(path: "/productivity/habits/\(id)/insights?from=\(from)&to=\(to)")
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

    func addHabitProgress(habitId: String, localDate: String, value: Double, idempotencyKey: String = ULID.generate()) async throws -> HabitProgressResultModel {
        try await request(
            path: "/productivity/habits/\(habitId)/progress",
            method: "POST",
            body: [
                "localDate": .string(localDate),
                "value": .number(value),
                "idempotencyKey": .string(idempotencyKey),
                "source": .string("MANUAL")
            ] as [String: JSONValue]
        )
    }

    func fetchHabitProgress(habitId: String, from: String, to: String) async throws -> [HabitProgressLogModel] {
        try await request(path: "/productivity/habits/\(habitId)/progress?from=\(from)&to=\(to)")
    }

    func deleteHabitProgress(id: String) async throws -> HabitOccurrenceModel {
        try await request(path: "/productivity/habit-progress/\(id)", method: "DELETE")
    }

    func createHabitReflection(habitId: String, habitName: String, localDate: String, occurrenceId: String?, contentMarkdown: String) async throws -> JournalNoteModel {
        var contextData: [String: JSONValue] = [
            "habitId": .string(habitId),
            "habitName": .string(habitName),
            "localDate": .string(localDate)
        ]
        if let occurrenceId { contextData["occurrenceId"] = .string(occurrenceId) }
        return try await request(
            path: "/journal/entries",
            method: "POST",
            body: [
                "id": .string(ULID.generate()),
                "kind": .string("NOTE"),
                "title": .string("\(habitName) — \(localDate)"),
                "contentMarkdown": .string(contentMarkdown),
                "entryDate": .string(localDate),
                "timezone": .string(TimeZone.current.identifier),
                "contextType": .string("HABIT_OCCURRENCE"),
                "contextId": .string(occurrenceId ?? habitId),
                "contextData": .object(contextData)
            ] as [String: JSONValue]
        )
    }

    func habitOccurrenceAction(habitId: String, localDate: String, action: String, idempotencyKey: String = ULID.generate()) async throws -> HabitOccurrenceModel {
        try await request(
            path: "/productivity/habits/\(habitId)/occurrence-action",
            method: "POST",
            body: [
                "localDate": .string(localDate),
                "action": .string(action.uppercased()),
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

