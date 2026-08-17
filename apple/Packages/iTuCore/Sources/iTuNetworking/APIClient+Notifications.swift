import Foundation
import iTuDomain

public extension APIClient {
    // MARK: - Notifications and reminders

    func fetchNotifications() async throws -> [AppNotificationModel] {
        try await request(path: "/productivity/notifications")
    }

    func markNotificationRead(id: String) async throws {
        let _: AppNotificationModel = try await request(path: "/productivity/notifications/\(id)/read", method: "PATCH")
    }

    func markAllNotificationsRead() async throws {
        let _: EmptyResponse = try await request(path: "/productivity/notifications/read-all", method: "POST")
    }

    func createTaskReminder(taskId: String, remindAt: String, persistent: Bool = false) async throws -> TaskReminderModel {
        try await request(
            path: "/productivity/tasks/\(taskId)/reminders",
            method: "POST",
            body: [
                "remindAt": .string(remindAt),
                "persistent": .bool(persistent)
            ] as [String: JSONValue]
        )
    }

    func snoozeTaskReminder(id: String, remindAt: String) async throws {
        let _: TaskReminderModel = try await request(
            path: "/productivity/task-reminders/\(id)/snooze",
            method: "POST",
            body: ["remindAt": .string(remindAt)] as [String: JSONValue]
        )
    }

    func updateTaskReminder(id: String, remindAt: String) async throws {
        let _: TaskReminderModel = try await request(
            path: "/productivity/task-reminders/\(id)",
            method: "PATCH",
            body: ["remindAt": .string(remindAt)] as [String: JSONValue]
        )
    }

    func dismissTaskReminder(id: String) async throws {
        let _: TaskReminderModel = try await request(path: "/productivity/task-reminders/\(id)/dismiss", method: "POST")
    }

    func snoozeHabitReminder(deliveryId: String, remindAt: String) async throws {
        let _: HabitReminderDeliveryModel = try await request(
            path: "/productivity/habit-reminder-deliveries/\(deliveryId)/snooze",
            method: "POST",
            body: ["remindAt": .string(remindAt)] as [String: JSONValue]
        )
    }

    func dismissHabitReminder(deliveryId: String) async throws {
        let _: HabitReminderDeliveryModel = try await request(
            path: "/productivity/habit-reminder-deliveries/\(deliveryId)/dismiss",
            method: "POST"
        )
    }

    func completeHabitReminder(deliveryId: String) async throws {
        let _: HabitProgressResultModel = try await request(
            path: "/productivity/habit-reminder-deliveries/\(deliveryId)/complete",
            method: "POST"
        )
    }
}

