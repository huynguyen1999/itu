import Foundation
import iTuDomain
private func habitOfflineStatus(_ habit: HabitModel?, value: Double) -> HabitOccurrenceStatus {
    guard let habit else { return value >= 1 ? .completed : .pending }
    let target = habit.scheduleType.uppercased() == "TIMES_PER_PERIOD"
        ? Double(habit.timesPerPeriod ?? 1)
        : habit.targetValue
    if habit.direction == .limit {
        return value > target ? .failed : .pending
    }
    return value >= target ? .completed : .pending
}

public extension OfflineStore {
    @discardableResult
    func updateHabits(_ fetchedHabits: [HabitModel]) throws -> OfflineSnapshot {
        for habit in fetchedHabits {
            if let index = state.habits.firstIndex(where: { $0.id == habit.id }) {
                state.habits[index] = habit
            } else {
                state.habits.append(habit)
            }
        }
        try persist()
        return state
    }

    @discardableResult
    func updateHabitOccurrences(
        _ fetchedOccurrences: [HabitOccurrenceModel],
        from startDate: String? = nil,
        to endDate: String? = nil
    ) throws -> OfflineSnapshot {
        let pendingOccurrenceIDs = Set(
            state.mutations
                .filter { $0.kind.hasPrefix("habitoccurrence.") }
                .map(\.entityId)
        )

        if let startDate, let endDate {
            state.habitOccurrences.removeAll { occurrence in
                let date = occurrence.localDayString
                return date >= startDate && date <= endDate && !pendingOccurrenceIDs.contains(occurrence.id)
            }
        }

        for occurrence in fetchedOccurrences {
            guard !pendingOccurrenceIDs.contains(occurrence.id) else { continue }
            if let index = state.habitOccurrences.firstIndex(where: { $0.id == occurrence.id }) {
                state.habitOccurrences[index] = occurrence
            } else {
                state.habitOccurrences.append(occurrence)
            }
        }
        try persist()
        return state
    }

    @discardableResult
    func checkInHabitOccurrence(
        id: String,
        value: Double,
        idempotencyKey: String = ULID.generate(),
        habitId: String? = nil,
        localDate: String? = nil
    ) throws -> OfflineSnapshot {
        guard let index = state.habitOccurrences.firstIndex(where: { $0.id == id }) else { return state }
        let now = ISO8601DateFormatter().string(from: Date())
        let occurrence = state.habitOccurrences[index]
        let habit = state.habits.first(where: { $0.id == occurrence.habitId })
        // The server owns completion and Growth eligibility. We can still
        // project the status for a complete local target, while preserving a
        // pending state for partial count/duration/quantity check-ins.
        let projectedValue = max(0, occurrence.value + value)
        state.habitOccurrences[index].status = habitOfflineStatus(habit, value: projectedValue)
        state.habitOccurrences[index].value = projectedValue
        var payload: [String: JSONValue] = [
            "value": .number(value),
            "idempotencyKey": .string(idempotencyKey),
            "occurredAt": .string(now)
        ]
        if let habitId { payload["habitId"] = .string(habitId) }
        if let localDate { payload["localDate"] = .string(localDate) }
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "habitoccurrence.checkin",
            entityId: id,
            payload: payload,
            occurredAt: now
        ))
        try persist()
        return state
    }

    @discardableResult
    func checkInHabitDate(
        habitId: String,
        date: String,
        value: Double,
        idempotencyKey: String = ULID.generate()
    ) throws -> OfflineSnapshot {
        if let occurrence = state.habitOccurrences.first(where: { $0.habitId == habitId && $0.localDayString == date }) {
            return try checkInHabitOccurrence(id: occurrence.id, value: value, idempotencyKey: idempotencyKey, habitId: habitId, localDate: date)
        }

        let habit = state.habits.first(where: { $0.id == habitId })
        let occurrenceId = ULID.generate()
        let now = ISO8601DateFormatter().string(from: Date())
        let occurrenceDateISO = "\(date)T00:00:00.000Z"
        let newOccurrence = HabitOccurrenceModel(
            id: occurrenceId,
            habitId: habitId,
            occurrenceDate: occurrenceDateISO,
            status: habitOfflineStatus(habit, value: value),
            value: value
        )
        state.habitOccurrences.append(newOccurrence)
        let payload: [String: JSONValue] = [
            "value": .number(value),
            "idempotencyKey": .string(idempotencyKey),
            "occurredAt": .string(now),
            "habitId": .string(habitId),
            "localDate": .string(date)
        ]
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "habitoccurrence.checkin",
            entityId: occurrenceId,
            payload: payload,
            occurredAt: now
        ))
        try persist()
        return state
    }

    @discardableResult
    func habitOccurrenceAction(
        id: String,
        action: String,
        idempotencyKey: String = ULID.generate(),
        habitId: String? = nil,
        localDate: String? = nil
    ) throws -> OfflineSnapshot {
        guard let index = state.habitOccurrences.firstIndex(where: { $0.id == id }) else { return state }
        let now = ISO8601DateFormatter().string(from: Date())
        state.habitOccurrences[index].status = switch action {
        case "skip": .skipped
        case "fail": .failed
        default: .pending
        }
        if action == "undo" {
            state.habitOccurrences[index].value = 0
        }
        var payload: [String: JSONValue] = [
            "action": .string(action),
            "idempotencyKey": .string(idempotencyKey)
        ]
        if let habitId { payload["habitId"] = .string(habitId) }
        if let localDate { payload["localDate"] = .string(localDate) }
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "habitoccurrence.action",
            entityId: id,
            payload: payload,
            occurredAt: now
        ))
        try persist()
        return state
    }

    @discardableResult
    func habitOccurrenceActionDate(
        habitId: String,
        date: String,
        action: String,
        idempotencyKey: String = ULID.generate()
    ) throws -> OfflineSnapshot {
        if let occurrence = state.habitOccurrences.first(where: { $0.habitId == habitId && $0.localDayString == date }) {
            return try habitOccurrenceAction(id: occurrence.id, action: action, idempotencyKey: idempotencyKey, habitId: habitId, localDate: date)
        }
        guard state.habits.contains(where: { $0.id == habitId }) else { return state }
        let now = ISO8601DateFormatter().string(from: Date())
        let occurrenceId = ULID.generate()
        state.habitOccurrences.append(HabitOccurrenceModel(
            id: occurrenceId,
            habitId: habitId,
            occurrenceDate: "\(date)T00:00:00.000Z",
            status: action.lowercased() == "skip" ? .skipped : action.lowercased() == "fail" ? .failed : .pending,
            value: 0
        ))
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "habitoccurrence.action",
            entityId: occurrenceId,
            payload: [
                "action": .string(action.lowercased()),
                "idempotencyKey": .string(idempotencyKey),
                "habitId": .string(habitId),
                "localDate": .string(date)
            ],
            occurredAt: now
        ))
        try persist()
        return state
    }

    @discardableResult
    func toggleHabitCheckIn(id: String) throws -> OfflineSnapshot {
        guard let index = state.habits.firstIndex(where: { $0.id == id }) else { return state }
        let now = ISO8601DateFormatter().string(from: Date())
        
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let todayStr = formatter.string(from: Date())
        
        var habit = state.habits[index]
        habit.isCompletedToday.toggle()
        if habit.isCompletedToday {
            habit.currentStreak += 1
            habit.bestStreak = max(habit.bestStreak, habit.currentStreak)
            habit.totalCompletions += 1
            state.habits[index] = habit
            
            if let occurrenceIndex = state.habitOccurrences.firstIndex(where: { $0.habitId == id && $0.localDayString == todayStr }) {
                let occurrence = state.habitOccurrences[occurrenceIndex]
                let projectedValue = max(0, occurrence.value + 1.0)
                state.habitOccurrences[occurrenceIndex].status = .completed
                state.habitOccurrences[occurrenceIndex].value = projectedValue
                appendMutation(SyncMutation(
                    id: ULID.generate(),
                    kind: "habitoccurrence.checkin",
                    entityId: occurrence.id,
                    payload: [
                        "value": .number(1.0),
                        "idempotencyKey": .string(ULID.generate()),
                        "occurredAt": .string(now)
                    ],
                    occurredAt: now
                ))
            } else {
                let occurrenceId = ULID.generate()
                let occurrenceDateISO = "\(todayStr)T00:00:00.000Z"
                let newOccurrence = HabitOccurrenceModel(
                    id: occurrenceId,
                    habitId: id,
                    occurrenceDate: occurrenceDateISO,
                    status: .completed,
                    value: 1.0
                )
                state.habitOccurrences.append(newOccurrence)
                appendMutation(SyncMutation(
                    id: ULID.generate(),
                    kind: "habitoccurrence.checkin",
                    entityId: occurrenceId,
                    payload: [
                        "value": .number(1.0),
                        "idempotencyKey": .string(ULID.generate()),
                        "occurredAt": .string(now)
                    ],
                    occurredAt: now
                ))
            }
        } else {
            habit.currentStreak = max(0, habit.currentStreak - 1)
            habit.totalCompletions = max(0, habit.totalCompletions - 1)
            state.habits[index] = habit
            
            if let occurrenceIndex = state.habitOccurrences.firstIndex(where: { $0.habitId == id && $0.localDayString == todayStr }) {
                let occurrence = state.habitOccurrences[occurrenceIndex]
                state.habitOccurrences[occurrenceIndex].status = .pending
                state.habitOccurrences[occurrenceIndex].value = 0.0
                appendMutation(SyncMutation(
                    id: ULID.generate(),
                    kind: "habitoccurrence.action",
                    entityId: occurrence.id,
                    payload: [
                        "action": .string("undo"),
                        "idempotencyKey": .string(ULID.generate())
                    ],
                    occurredAt: now
                ))
            }
        }
        
        try persist()
        return state
    }

    @discardableResult
    func saveHabit(_ habit: HabitModel) throws -> OfflineSnapshot {
        let now = ISO8601DateFormatter().string(from: Date())
        if let index = state.habits.firstIndex(where: { $0.id == habit.id }) {
            var updated = habit
            updated.version += 1
            state.habits[index] = updated
            let mutation = SyncMutation(
                id: ULID.generate(),
                kind: "habit.update",
                entityId: habit.id,
                baseVersion: habit.version,
                payload: [
                    "name": .string(habit.name),
                    "description": habit.description.map(JSONValue.string) ?? .null,
                    "icon": .string(habit.icon),
                    "color": .string(habit.color),
                    "frequency": .string(habit.frequency.rawValue),
                    "targetValue": .number(habit.targetValue),
                    "targetType": .string(habit.targetType),
                    "unit": habit.unit.map(JSONValue.string) ?? .null,
                    "targetDaysPerWeek": .number(Double(habit.targetDaysPerWeek)),
                    "direction": .string(habit.direction.rawValue),
                    "scheduleType": .string(habit.scheduleType),
                    "weekdays": .array(habit.weekdays.map { .number(Double($0)) }),
                    "intervalDays": habit.intervalDays.map { .number(Double($0)) } ?? .null,
                    "timesPerPeriod": habit.timesPerPeriod.map { .number(Double($0)) } ?? .null,
                    "period": habit.period.map(JSONValue.string) ?? .null,
                    "startDate": .string(habit.startDate),
                    "endDate": habit.endDate.map(JSONValue.string) ?? .null,
                    "timeBlockId": habit.timeBlockId.map(JSONValue.string) ?? .null,
                    "tagIds": .array(habit.tagIds.map(JSONValue.string)),
                    "allowedSkips": .number(Double(habit.allowedSkips)),
                    "restDays": .array(habit.restDays.map { .number(Double($0)) }),
                    "reminderTimes": .array(habit.reminderTimes.map(JSONValue.string)),
                    "checklistItems": .array(habit.checklistItems.map { .object(["title": .string($0.title), "required": .bool($0.required)]) }),
                    "archived": .bool(habit.archivedAt != nil)
                ],
                occurredAt: now
            )
            appendMutation(mutation)
        } else {
            state.habits.append(habit)
            let mutation = SyncMutation(
                id: ULID.generate(),
                kind: "habit.create",
                entityId: habit.id,
                payload: [
                    "name": .string(habit.name),
                    "description": habit.description.map(JSONValue.string) ?? .null,
                    "icon": .string(habit.icon),
                    "color": .string(habit.color),
                    "frequency": .string(habit.frequency.rawValue),
                    "targetValue": .number(habit.targetValue),
                    "targetType": .string(habit.targetType),
                    "unit": habit.unit.map(JSONValue.string) ?? .null,
                    "targetDaysPerWeek": .number(Double(habit.targetDaysPerWeek)),
                    "direction": .string(habit.direction.rawValue),
                    "scheduleType": .string(habit.scheduleType),
                    "weekdays": .array(habit.weekdays.map { .number(Double($0)) }),
                    "intervalDays": habit.intervalDays.map { .number(Double($0)) } ?? .null,
                    "timesPerPeriod": habit.timesPerPeriod.map { .number(Double($0)) } ?? .null,
                    "period": habit.period.map(JSONValue.string) ?? .null,
                    "timeBlockId": habit.timeBlockId.map(JSONValue.string) ?? .null,
                    "tagIds": .array(habit.tagIds.map(JSONValue.string)),
                    "allowedSkips": .number(Double(habit.allowedSkips)),
                    "restDays": .array(habit.restDays.map { .number(Double($0)) }),
                    "reminderTimes": .array(habit.reminderTimes.map(JSONValue.string)),
                    "checklistItems": .array(habit.checklistItems.map { .object(["title": .string($0.title), "required": .bool($0.required)]) }),
                    "startDate": .string(habit.startDate),
                    "endDate": habit.endDate.map(JSONValue.string) ?? .null
                ],
                occurredAt: now
            )
            appendMutation(mutation)
        }
        try persist()
        return state
    }


}
