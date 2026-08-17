import Foundation
import iTuDomain

extension AppModel {
    func createTaskFromIntent(title: String) async -> Bool {
        await createTask(title: title)
    }

    func completeTaskFromIntent(id: String) async -> Bool {
        guard let task = tasks.first(where: { $0.id == id }) else { return false }
        await complete(task)
        return tasks.first(where: { $0.id == id })?.status == .completed
    }

    func completeHabitFromIntent(id: String) async -> Bool {
        guard let habit = habits.first(where: { $0.id == id }) else { return false }
        guard !habit.isCompletedToday else { return true }
        return await checkIn(habit)
    }

    func incrementHabitFromIntent(id: String) async -> Bool {
        guard let habit = habits.first(where: { $0.id == id }) else { return false }
        return await checkIn(habit, value: 1)
    }
}
