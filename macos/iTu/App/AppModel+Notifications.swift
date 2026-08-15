import Foundation

@MainActor
extension AppModel {
    func markNotificationRead(_ notification: AppNotificationModel) async {
        do {
            try await apiClient.markNotificationRead(id: notification.id)
            if let index = notifications.firstIndex(where: { $0.id == notification.id }) {
                notifications[index].readAt = notifications[index].readAt ?? ISO8601DateFormatter().string(from: Date())
            }
        } catch {
            errorMessage = "Could not mark notification as read: \(error.localizedDescription)"
        }
    }

    func openNotification(_ notification: AppNotificationModel) async {
        await markNotificationRead(notification)
        guard let destination = Self.notificationDestination(for: notification.actionUrl) else { return }
        selectedTaskListId = nil
        selectedSection = destination
    }

    static func notificationDestination(for actionURL: String) -> AppSection? {
        guard let path = URL(string: actionURL)?.path else { return nil }
        switch path {
        case NotificationRoutePath.home: return .home
        case NotificationRoutePath.plan, NotificationRoutePath.inbox: return .inbox
        case NotificationRoutePath.today: return .today
        case NotificationRoutePath.upcoming: return .upcoming
        case NotificationRoutePath.matrix: return .matrix
        case NotificationRoutePath.focus: return .focus
        case NotificationRoutePath.habits: return .habits
        case NotificationRoutePath.statistics: return .statistics
        case let value where value == NotificationRoutePath.growth || value.hasPrefix("\(NotificationRoutePath.growth)/"):
            return .growth
        case let value where value == NotificationRoutePath.learn || value.hasPrefix("\(NotificationRoutePath.learn)/"):
            return .learn
        case NotificationRoutePath.trash: return .trash
        case NotificationRoutePath.profile: return .profile
        case NotificationRoutePath.settings: return .settings
        default: return nil
        }
    }

    func refreshNotifications() async {
        do {
            notifications = try await apiClient.fetchNotifications()
        } catch {
            // Keep the cached inbox visible when the server is unavailable.
        }
    }

    func markAllNotificationsRead() async {
        do {
            try await apiClient.markAllNotificationsRead()
            let timestamp = ISO8601DateFormatter().string(from: Date())
            notifications = notifications.map {
                var notification = $0
                notification.readAt = notification.readAt ?? timestamp
                return notification
            }
        } catch {
            errorMessage = "Could not mark notifications as read: \(error.localizedDescription)"
        }
    }

    func snoozeNotificationReminder(_ notification: AppNotificationModel) async {
        let remindAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600))
        do {
            if let deliveryId = notification.habitReminderDeliveryId {
                try await apiClient.snoozeHabitReminder(deliveryId: deliveryId, remindAt: remindAt)
            } else if let reminderId = notification.reminderId {
                try await apiClient.snoozeTaskReminder(id: reminderId, remindAt: remindAt)
            } else {
                return
            }
            await refreshNotifications()
        } catch {
            errorMessage = "Could not snooze the reminder: \(error.localizedDescription)"
        }
    }

    func dismissNotificationReminder(_ notification: AppNotificationModel) async {
        do {
            if let deliveryId = notification.habitReminderDeliveryId {
                try await apiClient.dismissHabitReminder(deliveryId: deliveryId)
            } else if let reminderId = notification.reminderId {
                try await apiClient.dismissTaskReminder(id: reminderId)
            } else {
                return
            }
            await refreshNotifications()
        } catch {
            errorMessage = "Could not dismiss the reminder: \(error.localizedDescription)"
        }
    }
    func completeHabitReminder(_ notification: AppNotificationModel) async {
        guard let deliveryId = notification.habitReminderDeliveryId else { return }
        do {
            try await apiClient.completeHabitReminder(deliveryId: deliveryId)
            await refreshNotifications()
            if let localDate = notification.habitLocalDate {
                await refreshHabitOccurrences(from: localDate, to: localDate, force: true)
            }
        } catch {
            errorMessage = "Could not complete the habit: \(error.localizedDescription)"
        }
    }

    func openHabitReminderLogger(_ notification: AppNotificationModel) async {
        await markNotificationRead(notification)
        guard let habitId = notification.habitId, let localDate = notification.habitLocalDate else {
            selectedSection = .habits
            return
        }
        selectedTaskListId = nil
        selectedSection = .habits
        pendingHabitQuickLog = HabitQuickLogRequest(habitId: habitId, localDate: localDate)
    }

    func createTaskReminder(taskId: String, remindAt: String) async {
        do {
            _ = try await apiClient.createTaskReminder(taskId: taskId, remindAt: remindAt)
            await loadServerState()
        } catch {
            errorMessage = "Could not create task reminder: \(error.localizedDescription)"
        }
    }

    func updateTaskReminder(id: String, remindAt: String) async {
        do {
            try await apiClient.updateTaskReminder(id: id, remindAt: remindAt)
            await loadServerState()
        } catch {
            errorMessage = "Could not update task reminder: \(error.localizedDescription)"
        }
    }

    func removeTaskReminder(id: String) async {
        do {
            try await apiClient.dismissTaskReminder(id: id)
            await loadServerState()
        } catch {
            errorMessage = "Could not remove task reminder: \(error.localizedDescription)"
        }
    }
}
