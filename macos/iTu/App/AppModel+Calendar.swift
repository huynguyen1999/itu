import Foundation

extension AppModel {
    @MainActor
    func updateCalendarPreferences(_ patch: [String: JSONValue]) async {
        var value = calendarPreferences
        if let zoom = patch["zoom"]?.stringValue, ["DAY", "WEEK", "MONTH"].contains(zoom.uppercased()) {
            value.zoom = zoom.uppercased()
        }
        if case let .array(kinds)? = patch["visibleKinds"] {
            value.visibleKinds = kinds.compactMap(\.stringValue)
        }
        if let showCompleted = patch["showCompleted"]?.boolValue { value.showCompleted = showCompleted }
        if case let .array(groups)? = patch["collapsedGroupIds"] {
            value.collapsedGroupIds = groups.compactMap(\.stringValue)
        }
        let mutation = SyncMutation(
            id: ULID.generate(),
            kind: "calendarpreferences.update",
            entityId: user?.id ?? "calendar",
            baseVersion: nil,
            payload: patch,
            occurredAt: ISO8601DateFormatter().string(from: Date())
        )
        do {
            apply(try await offlineStore.saveCalendarPreferences(value, mutation: mutation))
            syncPhase = .pending
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
