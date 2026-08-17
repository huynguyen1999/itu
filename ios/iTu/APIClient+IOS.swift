import Foundation
import iTuDomain
import iTuNetworking
import iTuOffline
import iTuSync

extension APIClient: @retroactive SyncTransport {
    public func synchronize(_ requestBody: SyncRequest) async throws -> SyncResponse {
        try await request(path: "/sync", method: "POST", body: requestBody)
    }
}

extension APIError: @retroactive SyncTransportFailure {
    public var syncFailureCode: String { code ?? (statusCode > 0 ? "HTTP_\(statusCode)" : "SYNC_FAILED") }
    public var syncRetryAfter: TimeInterval? { retryAfter }
    public var syncRecoverableMutationIDs: [String] {
        guard details?["reason"]?.stringValue == "MUTATION_ID_REUSED",
              let mutationID = details?["mutationId"]?.stringValue else { return [] }
        return [mutationID]
    }
    public var syncAcknowledgedMutationIDs: [String] {
        details?["acknowledgedMutationIds"]?.arrayValue?.compactMap(\.stringValue) ?? []
    }
    public var syncRetryable: Bool {
        statusCode == 0 || statusCode == 408 || statusCode == 425 || statusCode == 429 || statusCode >= 500
    }
}

private struct IOSTaskRecord: Decodable, Sendable {
    let task: ProductivityTask
}

extension APIClient {
    func registerSyncDevice(deviceId: String, cursor: String) async throws {
        let _: EmptyResponse = try await request(
            path: "/devices/register",
            method: "POST",
            body: [
                "deviceId": JSONValue.string(deviceId),
                "platform": JSONValue.string(platform),
                "lastKnownSyncCursor": JSONValue.string(cursor)
            ] as [String: JSONValue]
        )
    }

    func updateSyncDevice(deviceId: String, cursor: String) async throws {
        let _: EmptyResponse = try await request(
            path: "/devices/\(escapedPath(deviceId))",
            method: "PATCH",
            body: ["lastKnownSyncCursor": JSONValue.string(cursor)] as [String: JSONValue]
        )
    }

    func fetchTasks() async throws -> [ProductivityTask] {
        var cursor: String?
        var result: [ProductivityTask] = []
        repeat {
            var path = "/productivity/tasks?limit=100"
            if let cursor { path += "&cursor=\(escapedPath(cursor))" }
            let page: CursorPageResponse<IOSTaskRecord> = try await request(path: path)
            result.append(contentsOf: page.data.map(\.task))
            cursor = page.meta?.hasNextPage == true ? page.meta?.nextCursor : nil
        } while cursor != nil
        return result
    }

    func fetchTaskLists() async throws -> [TaskListModel] {
        try await request(path: "/productivity/task-lists")
    }

    func fetchHabits() async throws -> [HabitModel] {
        try await request(path: "/productivity/habits")
    }

    func fetchHabitOccurrences(from: String, to: String) async throws -> [HabitOccurrenceModel] {
        try await request(path: "/productivity/habit-occurrences?from=\(escapedPath(from))&to=\(escapedPath(to))")
    }

    func fetchActiveFocus() async throws -> FocusSession? {
        try await request(path: "/productivity/focus-sessions/active")
    }

    func fetchFocusHistory() async throws -> [FocusSession] {
        try await request(path: "/productivity/focus-sessions/history")
    }

    func fetchFocusSounds() async throws -> FocusSoundCatalog {
        try await request(path: "/productivity/focus-sounds")
    }

    func updateFocusSoundPreference(
        soundKey: String,
        enabled: Bool? = nil,
        sortOrder: Int? = nil,
        volume: Double? = nil
    ) async throws -> FocusSoundPreference {
        var body: [String: JSONValue] = [:]
        if let enabled { body["enabled"] = .bool(enabled) }
        if let sortOrder { body["sortOrder"] = .number(Double(sortOrder)) }
        if let volume { body["volume"] = .number(volume) }
        return try await request(
            path: "/productivity/focus-sounds/\(escapedPath(soundKey))/preferences",
            method: "PATCH",
            body: body
        )
    }
}
