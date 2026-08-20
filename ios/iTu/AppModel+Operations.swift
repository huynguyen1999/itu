import Foundation
import iTuDomain
import iTuNetworking
import iTuOffline

@MainActor
extension AppModel {
    // MARK: - Notifications

    func refreshNotifications() async {
        guard let context = phase6OperationContext() else { return }
        guard isOnline else {
            setPhase6NotificationsState(.failed("Notifications are available when online."))
            return
        }
        setPhase6NotificationsState(.loading)
        do {
            let notifications = try await apiClient.fetchNotifications()
            guard isCurrentPhase6Operation(context) else { return }
            setPhase6Notifications(notifications, state: .loaded)
        } catch {
            guard isCurrentPhase6Operation(context) else { return }
            setPhase6NotificationsState(.failed(error.localizedDescription))
        }
    }

    func markNotificationRead(_ notification: AppNotificationModel) async {
        guard let context = phase6OperationContext() else { return }
        guard notification.readAt == nil else { return }
        guard isOnline else {
            setFeatureError("Notifications can be marked read when online.")
            return
        }
        do {
            try await apiClient.markNotificationRead(id: notification.id)
            guard isCurrentPhase6Operation(context) else { return }
            markPhase6NotificationRead(id: notification.id, at: ISO8601DateFormatter().string(from: Date()))
        } catch {
            guard isCurrentPhase6Operation(context) else { return }
            setFeatureError("Could not mark notification as read: \(error.localizedDescription)")
        }
    }

    func markAllNotificationsRead() async {
        guard let context = phase6OperationContext() else { return }
        guard isOnline else {
            setFeatureError("Notifications can be marked read when online.")
            return
        }
        do {
            try await apiClient.markAllNotificationsRead()
            guard isCurrentPhase6Operation(context) else { return }
            let now = ISO8601DateFormatter().string(from: Date())
            let read = phase6State.notifications.map { notification in
                var copy = notification
                copy.readAt = copy.readAt ?? now
                return copy
            }
            setPhase6Notifications(read, state: .loaded)
        } catch {
            guard isCurrentPhase6Operation(context) else { return }
            setFeatureError("Could not mark notifications as read: \(error.localizedDescription)")
        }
    }

    func openNotification(_ notification: AppNotificationModel) async {
        guard let context = phase6OperationContext() else { return }
        await markNotificationRead(notification)
        guard isCurrentPhase6Operation(context) else { return }
        guard let url = URL(string: notification.actionUrl),
              let deepLink = IOSDeepLink(url: url),
              let destination = IOSDestination(rawValue: deepLink.destinationRawValue) else { return }
        requestNavigation(to: destination)
    }

    func createTaskReminder(taskID: String, remindAt: String, persistent: Bool = false) async -> Bool {
        guard let context = phase6OperationContext() else { return false }
        guard isOnline else {
            setFeatureError("Reminders are available when online.")
            return false
        }
        do {
            _ = try await apiClient.createTaskReminder(taskId: taskID, remindAt: remindAt, persistent: persistent)
            guard isCurrentPhase6Operation(context) else { return false }
            await refreshNotifications()
            guard isCurrentPhase6Operation(context) else { return false }
            await reconcileForeground()
            guard isCurrentPhase6Operation(context) else { return false }
            return true
        } catch {
            guard isCurrentPhase6Operation(context) else { return false }
            setFeatureError("Could not create reminder: \(error.localizedDescription)")
            return false
        }
    }

    func snoozeNotificationReminder(_ notification: AppNotificationModel, until remindAt: String) async -> Bool {
        guard let context = phase6OperationContext() else { return false }
        guard isOnline else {
            setFeatureError("Reminders are available when online.")
            return false
        }
        do {
            if let reminderID = notification.reminderId {
                try await apiClient.snoozeTaskReminder(id: reminderID, remindAt: remindAt)
            } else if let deliveryID = notification.habitReminderDeliveryId {
                try await apiClient.snoozeHabitReminder(deliveryId: deliveryID, remindAt: remindAt)
            } else {
                return false
            }
            guard isCurrentPhase6Operation(context) else { return false }
            await refreshNotifications()
            guard isCurrentPhase6Operation(context) else { return false }
            return true
        } catch {
            guard isCurrentPhase6Operation(context) else { return false }
            setFeatureError("Could not snooze reminder: \(error.localizedDescription)")
            return false
        }
    }

    func dismissNotificationReminder(_ notification: AppNotificationModel) async -> Bool {
        guard let context = phase6OperationContext() else { return false }
        guard isOnline else {
            setFeatureError("Reminders are available when online.")
            return false
        }
        do {
            if let reminderID = notification.reminderId {
                try await apiClient.dismissTaskReminder(id: reminderID)
            } else if let deliveryID = notification.habitReminderDeliveryId {
                try await apiClient.dismissHabitReminder(deliveryId: deliveryID)
            } else {
                return false
            }
            guard isCurrentPhase6Operation(context) else { return false }
            await refreshNotifications()
            guard isCurrentPhase6Operation(context) else { return false }
            return true
        } catch {
            guard isCurrentPhase6Operation(context) else { return false }
            setFeatureError("Could not dismiss reminder: \(error.localizedDescription)")
            return false
        }
    }

    func completeNotificationHabit(_ notification: AppNotificationModel) async -> Bool {
        guard let context = phase6OperationContext() else { return false }
        guard isOnline, let deliveryID = notification.habitReminderDeliveryId else {
            setFeatureError("Habit reminders are available when online.")
            return false
        }
        do {
            try await apiClient.completeHabitReminder(deliveryId: deliveryID)
            guard isCurrentPhase6Operation(context) else { return false }
            await refreshNotifications()
            guard isCurrentPhase6Operation(context) else { return false }
            return true
        } catch {
            guard isCurrentPhase6Operation(context) else { return false }
            setFeatureError("Could not complete habit reminder: \(error.localizedDescription)")
            return false
        }
    }

    // MARK: - Sync operations

    func retryPendingMutation(_ mutation: SyncMutation, keepLocal: Bool = false) async {
        _ = await performOfflineMutation { store in
            try await store.retryMutation(mutation.id, keepLocal: keepLocal)
        }
    }

    func retryPendingMutations(_ mutations: [SyncMutation], keepLocal: Bool = false) async {
        guard !mutations.isEmpty else { return }
        _ = await performOfflineMutation { store in
            try await store.retryMutations(mutations.map(\.id), keepLocal: keepLocal)
        }
    }

    func discardPendingMutation(_ mutation: SyncMutation) async {
        _ = await performOfflineMutation { store in
            try await store.discardMutation(mutation.id)
        }
    }

    func discardPendingMutations(_ mutations: [SyncMutation]) async {
        guard !mutations.isEmpty else { return }
        _ = await performOfflineMutation { store in
            try await store.discardMutations(mutations.map(\.id))
        }
    }

    func keepConflict(_ conflict: SyncConflict) async {
        _ = await performOfflineMutation { store in
            try await store.keepConflict(conflict)
        }
    }

    func discardFailedMutations() async {
        _ = await performOfflineMutation { store in
            try await store.discardFailedMutations()
        }
    }

    // MARK: - Account

    func updateProfile(displayName: String, username: String?) async -> Bool {
        guard let context = phase6OperationContext() else { return false }
        do {
            let session = try await apiClient.updateProfile(
                displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : displayName,
                username: username?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == true ? nil : username
            )
            guard isCurrentPhase6Operation(context), session.user.id == context.accountID else { return false }
            setUpdatedAuthenticatedUser(session.user)
            return true
        } catch {
            guard isCurrentPhase6Operation(context) else { return false }
            setFeatureError("Could not save profile: \(error.localizedDescription)")
            return false
        }
    }

    func changePassword(currentPassword: String, newPassword: String) async -> Bool {
        guard let context = phase6OperationContext() else { return false }
        do {
            try await apiClient.changePassword(currentPassword: currentPassword, newPassword: newPassword)
            guard isCurrentPhase6Operation(context) else { return false }
            return true
        } catch {
            guard isCurrentPhase6Operation(context) else { return false }
            setFeatureError("Could not change password: \(error.localizedDescription)")
            return false
        }
    }

    func exportAccountData() async throws -> JSONValue {
        guard let context = phase6OperationContext() else {
            throw APIError(statusCode: 401, message: "No active account.")
        }
        do {
            let value = try await apiClient.exportAccountData()
            guard isCurrentPhase6Operation(context) else { throw CancellationError() }
            return value
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            guard isCurrentPhase6Operation(context) else { throw CancellationError() }
            throw error
        }
    }

    func deleteAccount(password: String?) async -> Bool {
        guard let context = phase6OperationContext() else { return false }
        do {
            try await apiClient.deleteAccount(password: password)
            guard isCurrentPhase6Operation(context) else { return false }
            await logout()
            return true
        } catch {
            guard isCurrentPhase6Operation(context) else { return false }
            setFeatureError("Could not delete account: \(error.localizedDescription)")
            return false
        }
    }

    // MARK: - Usage preferences

    func updateUsagePreferences(_ preferences: UsagePreferences) async -> Bool {
        guard let context = phase6OperationContext() else { return false }
        guard isOnline else {
            setFeatureError("Usage settings can be changed when online.")
            return false
        }
        do {
            try await apiClient.updateUsagePreferences(preferences)
            guard isCurrentPhase6Operation(context) else { return false }
            setPhase6UsagePreferences(preferences)
            return true
        } catch {
            guard isCurrentPhase6Operation(context) else { return false }
            setFeatureError("Could not save usage settings: \(error.localizedDescription)")
            return false
        }
    }

    // MARK: - Trash

    var trashedTasks: [ProductivityTask] {
        trashSnapshot?.tasks ?? tasks.filter { $0.deletedAt != nil }
    }

    var trashedDecks: [DeckModel] { trashSnapshot?.decks ?? [] }
    var trashedCards: [CardModel] { trashSnapshot?.cards ?? [] }
    var trashedJournalEntries: [JournalNoteModel] { trashSnapshot?.journalEntries ?? journalNotes.filter { $0.deletedAt != nil } }
    var trashedExpenses: [ExpenseModel] { trashSnapshot?.expenses ?? expenses.filter { $0.deletedAt != nil } }
    var trashedGymWorkouts: [WorkoutModel] { trashSnapshot?.gymWorkouts ?? gymWorkouts.filter { $0.deletedAt != nil } }
    var trashedGymExercises: [ExerciseModel] { trashSnapshot?.gymExercises ?? gymExercises.filter { $0.deletedAt != nil } }

    func restoreTrashTask(_ task: ProductivityTask) async -> Bool {
        await performOfflineMutation { store in
            try await store.restoreTask(id: task.id)
        }
    }

    func restoreTrashDeck(_ deck: DeckModel) async -> Bool {
        await performOfflineMutation { store in
            try await store.restoreDeck(deck)
        }
    }

    func restoreTrashCard(_ card: CardModel) async -> Bool {
        await performOfflineMutation { store in
            try await store.restoreCard(card)
        }
    }

    func restoreTrashJournalEntry(_ entry: JournalNoteModel) async -> Bool {
        guard let context = phase6OperationContext() else { return false }
        guard isOnline else {
            setFeatureError("Journal restoration is available when online.")
            return false
        }
        do {
            try await apiClient.restoreTrashJournalEntry(id: entry.id)
            guard isCurrentPhase6Operation(context) else { return false }
            await refreshTrash()
            guard isCurrentPhase6Operation(context) else { return false }
            return true
        } catch {
            guard isCurrentPhase6Operation(context) else { return false }
            setFeatureError("Could not restore journal entry: \(error.localizedDescription)")
            return false
        }
    }

    func restoreTrashExpense(_ expense: ExpenseModel) async -> Bool {
        guard let context = phase6OperationContext() else { return false }
        guard isOnline else {
            setFeatureError("Expense restoration is available when online.")
            return false
        }
        do {
            try await apiClient.restoreTrashExpense(id: expense.id)
            guard isCurrentPhase6Operation(context) else { return false }
            await refreshTrash()
            guard isCurrentPhase6Operation(context) else { return false }
            return true
        } catch {
            guard isCurrentPhase6Operation(context) else { return false }
            setFeatureError("Could not restore expense: \(error.localizedDescription)")
            return false
        }
    }

    func restoreTrashGymWorkout(_ workout: WorkoutModel) async -> Bool {
        guard let context = phase6OperationContext() else { return false }
        guard isOnline else {
            setFeatureError("Workout restoration is available when online.")
            return false
        }
        do {
            try await apiClient.restoreTrashGymWorkout(id: workout.id)
            guard isCurrentPhase6Operation(context) else { return false }
            await refreshTrash()
            guard isCurrentPhase6Operation(context) else { return false }
            return true
        } catch {
            guard isCurrentPhase6Operation(context) else { return false }
            setFeatureError("Could not restore workout: \(error.localizedDescription)")
            return false
        }
    }

    func restoreTrashGymExercise(_ exercise: ExerciseModel) async -> Bool {
        guard let context = phase6OperationContext() else { return false }
        guard isOnline else {
            setFeatureError("Exercise restoration is available when online.")
            return false
        }
        do {
            try await apiClient.restoreTrashGymExercise(id: exercise.id)
            guard isCurrentPhase6Operation(context) else { return false }
            await refreshTrash()
            guard isCurrentPhase6Operation(context) else { return false }
            return true
        } catch {
            guard isCurrentPhase6Operation(context) else { return false }
            setFeatureError("Could not restore exercise: \(error.localizedDescription)")
            return false
        }
    }

    func permanentlyDeleteTrashTask(_ task: ProductivityTask) async -> Bool {
        await permanentlyDeleteTrash { try await apiClient.permanentlyDeleteTrashTask(id: task.id) }
    }

    func permanentlyDeleteTrashDeck(_ deck: DeckModel) async -> Bool {
        await permanentlyDeleteTrash { try await apiClient.permanentlyDeleteTrashDeck(id: deck.id) }
    }

    func permanentlyDeleteTrashCard(_ card: CardModel) async -> Bool {
        await permanentlyDeleteTrash { try await apiClient.permanentlyDeleteTrashCard(id: card.id) }
    }

    func permanentlyDeleteTrashJournalEntry(_ entry: JournalNoteModel) async -> Bool {
        await permanentlyDeleteTrash { try await apiClient.permanentlyDeleteTrashJournalEntry(id: entry.id) }
    }

    func permanentlyDeleteTrashExpense(_ expense: ExpenseModel) async -> Bool {
        await permanentlyDeleteTrash { try await apiClient.permanentlyDeleteTrashExpense(id: expense.id) }
    }

    func permanentlyDeleteTrashGymWorkout(_ workout: WorkoutModel) async -> Bool {
        await permanentlyDeleteTrash { try await apiClient.permanentlyDeleteTrashGymWorkout(id: workout.id) }
    }

    func permanentlyDeleteTrashGymExercise(_ exercise: ExerciseModel) async -> Bool {
        await permanentlyDeleteTrash { try await apiClient.permanentlyDeleteTrashGymExercise(id: exercise.id) }
    }

    private func permanentlyDeleteTrash(_ operation: () async throws -> Void) async -> Bool {
        guard let context = phase6OperationContext() else { return false }
        guard isOnline else {
            setFeatureError("Permanent deletion is available when online.")
            return false
        }
        do {
            try await operation()
            guard isCurrentPhase6Operation(context) else { return false }
            await refreshTrash()
            guard isCurrentPhase6Operation(context) else { return false }
            return true
        } catch {
            guard isCurrentPhase6Operation(context) else { return false }
            setFeatureError("Could not permanently delete item: \(error.localizedDescription)")
            return false
        }
    }
}
