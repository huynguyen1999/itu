import SwiftUI
import iTuDomain

struct Phase6NotificationsView: View {
    @ObservedObject var model: AppModel
    @State private var dismissalTarget: AppNotificationModel?

    init(model: AppModel) {
        self.model = model
    }

    private var unreadCount: Int {
        model.notifications.reduce(into: 0) { count, notification in
            if notification.readAt == nil { count += 1 }
        }
    }

    var body: some View {
        List {
            if let message = model.notificationsErrorMessage {
                Section {
                    Label(message, systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                    Button("Try again") { Task { await model.refreshNotifications() } }
                }
            }

            if model.notifications.isEmpty && model.notificationsState != .loading {
                IOSContentUnavailableView("No notifications", systemImage: "bell.slash", description: "New reminders and account updates will appear here.")
            }

            ForEach(model.notifications) { notification in
                notificationRow(notification)
            }
        }
        .overlay {
            if model.notificationsState.isLoading {
                ProgressView("Loading notifications…")
            }
        }
        .navigationTitle(unreadCount == 0 ? "Notifications" : "Notifications (\(unreadCount))")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("Mark all read") { Task { await model.markAllNotificationsRead() } }
                    .disabled(unreadCount == 0 || model.notificationsState.isLoading)
                    .accessibilityHint("Marks every notification as read.")
            }
        }
        .task { await model.refreshNotifications() }
        .refreshable { await model.refreshNotifications() }
        .confirmationDialog(
            "Dismiss reminder?",
            isPresented: Binding(get: { dismissalTarget != nil }, set: { if !$0 { dismissalTarget = nil } }),
            presenting: dismissalTarget
        ) { target in
            Button("Dismiss", role: .destructive) {
                dismissalTarget = nil
                Task { _ = await model.dismissNotificationReminder(target) }
            }
            Button("Keep reminder", role: .cancel) { dismissalTarget = nil }
        } message: { _ in
            Text("Dismissal changes the server reminder. No undo endpoint is available; keeping it here is the only safe way to cancel before sending.")
        }
    }

    @ViewBuilder
    private func notificationRow(_ notification: AppNotificationModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                Task { await model.openNotification(notification) }
            } label: {
                HStack(alignment: .top, spacing: 10) {
                    Circle()
                        .fill(notification.readAt == nil ? Color.accentColor : Color.secondary.opacity(0.25))
                        .frame(width: 8, height: 8)
                        .padding(.top, 6)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(notification.title)
                            .font(.headline)
                            .foregroundStyle(.primary)
                        Text(notification.body)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.leading)
                        Text(notification.createdAt)
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    Spacer(minLength: 0)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(notification.title)
            .accessibilityValue("\(notification.readAt == nil ? "Unread" : "Read"). \(notification.body)")
            .accessibilityHint("Opens this notification and marks it as read.")

            ViewThatFits(in: .horizontal) {
                HStack { notificationActions(notification) }
                VStack(alignment: .leading) { notificationActions(notification) }
            }
            .buttonStyle(.bordered)
            .font(.caption)
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private func notificationActions(_ notification: AppNotificationModel) -> some View {
                if notification.readAt == nil {
                    Button("Mark read") { Task { await model.markNotificationRead(notification) } }
                        .accessibilityHint("Marks this notification as read.")
                }
                if notification.habitReminderDeliveryId != nil,
                   notification.habitTargetType?.uppercased() == "BOOLEAN" {
                    Button("Complete") { Task { _ = await model.completeNotificationHabit(notification) } }
                }
                if notification.reminderId != nil || notification.habitReminderDeliveryId != nil {
                    Button("Snooze 1 hour") {
                        Task { _ = await model.snoozeNotificationReminder(notification, until: Self.oneHourFromNow()) }
                    }
                    Button("Dismiss", role: .destructive) {
                        dismissalTarget = notification
                    }
                }
    }

    private static func oneHourFromNow() -> String {
        ISO8601DateFormatter().string(from: Date().addingTimeInterval(3_600))
    }
}
