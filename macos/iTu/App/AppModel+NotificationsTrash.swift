import Foundation

@MainActor
extension AppModel {
    func refreshTrash() async {
        trashIsLoading = true
        trashErrorMessage = nil
        defer { trashIsLoading = false }
        do {
            trashSnapshot = try await apiClient.fetchTrash()
        } catch {
            trashErrorMessage = "Could not load Trash: \(error.localizedDescription)"
        }
    }

    func restoreTrashDeck(_ deck: DeckModel) async {
        do {
            apply(try await offlineStore.restoreDeck(deck))
            trashSnapshot?.decks.removeAll { $0.id == deck.id }
            syncPhase = .pending
        } catch {
            trashErrorMessage = "Could not restore deck: \(error.localizedDescription)"
        }
    }

    func archiveDeck(_ deck: DeckModel) async {
        do {
            apply(try await offlineStore.deleteDeck(id: deck.id))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not archive the deck: \(error.localizedDescription)"
        }
    }

    func restoreTrashCard(_ card: CardModel) async {
        do {
            apply(try await offlineStore.restoreCard(card))
            trashSnapshot?.cards.removeAll { $0.id == card.id }
            syncPhase = .pending
        } catch {
            trashErrorMessage = "Could not restore card: \(error.localizedDescription)"
        }
    }

    func permanentlyDeleteTrashDeck(_ deck: DeckModel) async {
        do {
            try await apiClient.permanentlyDeleteTrashDeck(id: deck.id)
            trashSnapshot?.decks.removeAll { $0.id == deck.id }
        } catch {
            trashErrorMessage = "Could not permanently delete deck: \(error.localizedDescription)"
        }
    }

    func permanentlyDeleteTrashCard(_ card: CardModel) async {
        do {
            try await apiClient.permanentlyDeleteTrashCard(id: card.id)
            trashSnapshot?.cards.removeAll { $0.id == card.id }
        } catch {
            trashErrorMessage = "Could not permanently delete card: \(error.localizedDescription)"
        }
    }

    func restoreTrashTask(_ task: ProductivityTask) async {
        if tasks.contains(where: { $0.id == task.id }) {
            await restoreTask(task)
            trashSnapshot?.tasks.removeAll { $0.id == task.id }
            return
        }

        do {
            try await apiClient.restoreTrashTask(id: task.id)
            trashSnapshot?.tasks.removeAll { $0.id == task.id }
            await loadServerState()
        } catch {
            trashErrorMessage = "Could not restore task: \(error.localizedDescription)"
        }
    }

    func permanentlyDeleteTrashTask(_ task: ProductivityTask) async {
        if tasks.contains(where: { $0.id == task.id }) {
            await deleteTask(task)
            trashSnapshot?.tasks.removeAll { $0.id == task.id }
            return
        }

        do {
            try await apiClient.permanentlyDeleteTrashTask(id: task.id)
            trashSnapshot?.tasks.removeAll { $0.id == task.id }
        } catch {
            trashErrorMessage = "Could not permanently delete task: \(error.localizedDescription)"
        }
    }

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
        guard !notification.reminderId.isEmpty else { return }
        let remindAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600))
        do {
            try await apiClient.snoozeTaskReminder(id: notification.reminderId, remindAt: remindAt)
            await refreshNotifications()
        } catch {
            errorMessage = "Could not snooze the reminder: \(error.localizedDescription)"
        }
    }

    func dismissNotificationReminder(_ notification: AppNotificationModel) async {
        guard !notification.reminderId.isEmpty else { return }
        do {
            try await apiClient.dismissTaskReminder(id: notification.reminderId)
            await refreshNotifications()
        } catch {
            errorMessage = "Could not dismiss the reminder: \(error.localizedDescription)"
        }
    }

    func createTaskReminder(taskId: String, remindAt: String) async {
        do {
            _ = try await apiClient.createTaskReminder(taskId: taskId, remindAt: remindAt)
            await loadServerState()
        } catch {
            errorMessage = "Could not create task reminder: \(error.localizedDescription)"
        }
    }


}
