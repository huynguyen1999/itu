import Foundation
@testable import iTu

enum PlanningPerformanceFixtures {
    static func tasks(active: Int, completed: Int = 0) -> [ProductivityTask] {
        let calendar = Calendar(identifier: .gregorian)
        let day = calendar.date(from: DateComponents(year: 2026, month: 8, day: 14, hour: 12))!
        let formatter = ISO8601DateFormatter()

        return (0..<(active + completed)).map { index in
            var task = ProductivityTask.optimistic(
                id: String(format: "fixture-task-%03d", index),
                title: "Fixture task \(index)",
                descriptionMarkdown: index.isMultiple(of: 5) ? "Representative task description" : "",
                priority: [.none, .low, .medium, .high][index % 4],
                dueAt: formatter.string(from: calendar.date(byAdding: .day, value: index % 9 - 4, to: day)!),
                taskListId: "fixture-project-\(index % 4)"
            )
            if index.isMultiple(of: 3) {
                task.reminders = [
                    TaskReminderModel(
                        id: "fixture-reminder-\(index)",
                        remindAt: formatter.string(from: calendar.date(byAdding: .hour, value: 2, to: day)!),
                        status: "SCHEDULED",
                        persistent: false
                    )
                ]
            }
            if index >= active {
                task.status = index.isMultiple(of: 2) ? .completed : .canceled
            }
            return task
        }
    }
}
