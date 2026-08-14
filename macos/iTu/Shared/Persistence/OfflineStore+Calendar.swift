import Foundation

extension OfflineStore {
    @discardableResult
    func saveCalendarPreferences(_ value: CalendarPreferencesModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        state.calendarPreferences = value
        appendMutation(mutation)
        try persist()
        return state
    }

    func applyCalendarChanges(_ changes: [SyncChange]) throws {
        for change in changes where change.entityType.lowercased().replacingOccurrences(of: "_", with: "") == "calendarpreferences" {
            guard !state.mutations.contains(where: { $0.kind == "calendarpreferences.update" && ($0.entityId == change.entityId || change.entityId == "calendar" || $0.entityId == "calendar") }) else { continue }
            guard !change.deleted, let data = change.data else { continue }
            let resource: JSONValue = {
                guard case let .object(fields) = data, let nested = fields["calendarPreferences"] else { return data }
                return nested
            }()
            guard let encoded = try? encoder.encode(resource),
                  let preferences = try? decoder.decode(CalendarPreferencesModel.self, from: encoded) else { continue }
            state.calendarPreferences = preferences
        }
        try persist()
    }
}
