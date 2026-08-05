import SwiftUI

struct NotificationsView: View {
    @Environment(AppModel.self) private var model
    @State private var hoveredID: String?

    private var unreadCount: Int {
        model.notifications.filter { $0.readAt == nil }.count
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        iTuSectionLabel(title: "INBOX", color: iTuTheme.teal)
                        Text("Notifications")
                            .font(.system(size: 24, weight: .bold, design: .rounded))
                            .foregroundStyle(iTuTheme.ink)
                        Text("Reminders and updates that need your attention.")
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    Spacer()
                    if unreadCount > 0 {
                        Button("Mark All Read") {
                            Task { await model.markAllNotificationsRead() }
                        }
                        .buttonStyle(iTuGhostButtonStyle(height: 34))
                    }
                }

                if model.notifications.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "bell.slash")
                            .font(.system(size: 34))
                            .foregroundStyle(iTuTheme.inkDim)
                        Text("You’re all caught up")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                        Text("New reminders and updates will appear here.")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 52)
                    .iTuPanel(radius: 14)
                } else {
                    VStack(spacing: 10) {
                        ForEach(model.notifications) { notification in
                            notificationRow(notification)
                        }
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 980)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .background(iTuTheme.canvas)
        .onAppear { Task { await model.refreshNotifications() } }
    }

    private func notificationRow(_ notification: AppNotificationModel) -> some View {
        Button {
            Task { await model.openNotification(notification) }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Circle()
                    .fill(notification.readAt == nil ? iTuTheme.teal : iTuTheme.border)
                    .frame(width: 8, height: 8)
                    .padding(.top, 5)

                VStack(alignment: .leading, spacing: 5) {
                    Text(notification.title)
                        .font(.system(size: 14, weight: notification.readAt == nil ? .semibold : .medium))
                        .foregroundStyle(iTuTheme.ink)
                    Text(notification.body)
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                        .lineLimit(3)
                    Text(Self.formatDate(notification.createdAt))
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                }
                Spacer()
                if notification.readAt == nil {
                    Text("NEW")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.teal)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(hoveredID == notification.id ? iTuTheme.mintTint.opacity(0.25) : iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(notification.readAt == nil ? iTuTheme.teal.opacity(0.35) : iTuTheme.border, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .onHover { hoveredID = $0 ? notification.id : nil }
        .contextMenu {
            if notification.readAt == nil {
                Button("Mark as Read") {
                    Task { await model.markNotificationRead(notification) }
                }
            }
            if !notification.reminderId.isEmpty {
                Button("Snooze 1 Hour") {
                    Task { await model.snoozeNotificationReminder(notification) }
                }
                Button("Dismiss Reminder", role: .destructive) {
                    Task { await model.dismissNotificationReminder(notification) }
                }
            }
        }
    }

    private static func formatDate(_ value: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: value) else { return value }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
