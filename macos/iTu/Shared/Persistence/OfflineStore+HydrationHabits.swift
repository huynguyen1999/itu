import Foundation

extension OfflineStore {
    func reapplyPendingHabitMutations(optimisticByID: [String: HabitModel]) throws {
        for mutation in state.mutations where mutation.kind == "habit.update" || mutation.kind == "habit.create" || mutation.kind == "habit.checkin" {
            if mutation.kind == "habit.checkin" {
                if let opt = optimisticByID[mutation.entityId], let index = state.habits.firstIndex(where: { $0.id == mutation.entityId }) {
                    state.habits[index] = opt
                }
                continue
            }
            let habit = state.habits.first(where: { $0.id == mutation.entityId }) ?? optimisticByID[mutation.entityId]
            guard habit != nil else { continue }
            guard var value = habit else { continue }
            if let name = mutation.payload["name"]?.stringValue { value.name = name }
            if case let .string(description)? = mutation.payload["description"] { value.description = description }
            if case .null? = mutation.payload["description"] { value.description = nil }
            if let icon = mutation.payload["icon"]?.stringValue { value.icon = icon }
            if let color = mutation.payload["color"]?.stringValue { value.color = color }
            if let frequency = mutation.payload["frequency"]?.stringValue, let parsed = HabitFrequency(rawValue: frequency) { value.frequency = parsed }
            if let target = mutation.payload["targetValue"]?.numberValue { value.targetValue = target }
            if let targetType = mutation.payload["targetType"]?.stringValue { value.targetType = targetType }
            if case let .string(unit)? = mutation.payload["unit"] { value.unit = unit }
            if case .null? = mutation.payload["unit"] { value.unit = nil }
            if let days = mutation.payload["targetDaysPerWeek"]?.numberValue { value.targetDaysPerWeek = Int(days) }
            if let direction = mutation.payload["direction"]?.stringValue, let parsed = HabitDirection(rawValue: direction) { value.direction = parsed }
            if let schedule = mutation.payload["scheduleType"]?.stringValue { value.scheduleType = schedule }
            if case let .array(days)? = mutation.payload["weekdays"] { value.weekdays = days.compactMap { $0.numberValue.map(Int.init) } }
            if let interval = mutation.payload["intervalDays"]?.numberValue { value.intervalDays = Int(interval) }
            if case .null? = mutation.payload["intervalDays"] { value.intervalDays = nil }
            if let times = mutation.payload["timesPerPeriod"]?.numberValue { value.timesPerPeriod = Int(times) }
            if case .null? = mutation.payload["timesPerPeriod"] { value.timesPerPeriod = nil }
            if case let .string(period)? = mutation.payload["period"] { value.period = period }
            if case .null? = mutation.payload["period"] { value.period = nil }
            if let start = mutation.payload["startDate"]?.stringValue { value.startDate = start }
            if case let .string(end)? = mutation.payload["endDate"] { value.endDate = end }
            if case .null? = mutation.payload["endDate"] { value.endDate = nil }
            if case let .string(block)? = mutation.payload["timeBlockId"] { value.timeBlockId = block }
            if case .null? = mutation.payload["timeBlockId"] { value.timeBlockId = nil }
            if case let .array(tags)? = mutation.payload["tagIds"] { value.tagIds = tags.compactMap(\.stringValue) }
            if case .bool(true)? = mutation.payload["archived"] { value.archivedAt = value.archivedAt ?? ISO8601DateFormatter().string(from: Date()) }
            if let index = state.habits.firstIndex(where: { $0.id == value.id }) { state.habits[index] = value } else { state.habits.append(value) }
        }

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let todayStr = formatter.string(from: Date())

        for mutation in state.mutations {
            if mutation.kind == "habitoccurrence.checkin" {
                if let occurrence = state.habitOccurrences.first(where: { $0.id == mutation.entityId }),
                   occurrence.localDayString == todayStr,
                   let habitIndex = state.habits.firstIndex(where: { $0.id == occurrence.habitId }) {
                    if let optimisticHabit = optimisticByID[occurrence.habitId] {
                        state.habits[habitIndex].isCompletedToday = optimisticHabit.isCompletedToday
                        state.habits[habitIndex].currentStreak = optimisticHabit.currentStreak
                        state.habits[habitIndex].bestStreak = optimisticHabit.bestStreak
                        state.habits[habitIndex].totalCompletions = optimisticHabit.totalCompletions
                    } else {
                        state.habits[habitIndex].isCompletedToday = true
                    }
                }
            } else if mutation.kind == "habitoccurrence.action",
                      let action = mutation.payload["action"]?.stringValue,
                      action == "undo" {
                if let occurrence = state.habitOccurrences.first(where: { $0.id == mutation.entityId }),
                   occurrence.localDayString == todayStr,
                   let habitIndex = state.habits.firstIndex(where: { $0.id == occurrence.habitId }) {
                    if let optimisticHabit = optimisticByID[occurrence.habitId] {
                        state.habits[habitIndex].isCompletedToday = optimisticHabit.isCompletedToday
                        state.habits[habitIndex].currentStreak = optimisticHabit.currentStreak
                        state.habits[habitIndex].bestStreak = optimisticHabit.bestStreak
                        state.habits[habitIndex].totalCompletions = optimisticHabit.totalCompletions
                    } else {
                        state.habits[habitIndex].isCompletedToday = false
                    }
                }
            }
        }
    }
}
