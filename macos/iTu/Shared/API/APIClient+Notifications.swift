import Foundation

extension APIClient {
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
}
