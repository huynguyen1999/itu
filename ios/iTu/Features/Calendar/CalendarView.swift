import SwiftUI
import iTuDomain

struct CalendarView: View {
    @EnvironmentObject private var model: AppModel
    @StateObject private var appleCalendar = IOSEventKitCalendar()

    private var items: [IOSCalendarTimelineItem] {
        IOSProductCalendar.timeline(for: model.tasks, day: model.todayString)
    }

    var body: some View {
        List {
            Section { SyncBanner() }
            Section("Today · \(model.todayString)") {
                if items.isEmpty {
                    Text("No scheduled or due tasks for today.").foregroundStyle(.secondary)
                } else {
                    ForEach(items) { item in
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: item.isDue ? "calendar.badge.exclamationmark" : "calendar")
                                .foregroundStyle(item.isDue ? .orange : .teal).accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(item.title)
                                Text(item.isDue ? "Due \(displayTime(item.startAt))" : scheduleLabel(item))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("\(item.title), \(item.isDue ? "due" : "scheduled") \(scheduleLabel(item))")
                    }
                }
            }
            Section("Apple Calendar") {
                LabeledContent("Access", value: appleCalendar.authorizationState.title)
                switch appleCalendar.authorizationState {
                case .notDetermined:
                    Button(appleCalendar.isRequesting ? "Requesting access…" : "Allow Calendar access") {
                        Task {
                            await appleCalendar.requestAccess()
                            appleCalendar.loadEvents(for: model.todayString)
                        }
                    }
                    .disabled(appleCalendar.isRequesting)
                case .authorized:
                    if appleCalendar.events.isEmpty {
                        Text("No Apple Calendar events for today.").foregroundStyle(.secondary)
                    } else {
                        ForEach(appleCalendar.events) { event in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(event.title)
                                Text(event.isAllDay ? "All day · \(event.calendarTitle)" : "\(displayTime(event.startDate)) – \(displayTime(event.endDate)) · \(event.calendarTitle)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                case .writeOnly:
                    Text("Calendar access is write-only, so iTu cannot read events.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                case .denied, .restricted:
                    Text("Calendar access is unavailable. Enable full calendar access in iOS Settings.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if let errorMessage = appleCalendar.errorMessage {
                    Text(errorMessage).font(.footnote).foregroundStyle(.red)
                }
            }
        }
        .navigationTitle("Calendar")
        .task {
            appleCalendar.refreshAuthorization()
            appleCalendar.loadEvents(for: model.todayString)
        }
    }

    private func scheduleLabel(_ item: IOSCalendarTimelineItem) -> String {
        guard let endAt = item.endAt else { return displayTime(item.startAt) }
        return displayTime(item.startAt) + " – " + displayTime(endAt)
    }

    private func displayTime(_ value: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if parser.date(from: value) == nil { parser.formatOptions = [.withInternetDateTime] }
        guard let date = parser.date(from: value) else { return String(value.prefix(16)) }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = IOSProductCalendar.timezone
        f.dateFormat = "h:mm a"
        return f.string(from: date)
    }

    private func displayTime(_ value: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = IOSProductCalendar.timezone
        f.dateFormat = "h:mm a"
        return f.string(from: value)
    }
}
