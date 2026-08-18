import SwiftUI
import iTuDomain
import iTuDesignCore

public struct CalendarView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var appleCalendar = IOSEventKitCalendar()

    private var items: [IOSCalendarTimelineItem] {
        IOSProductCalendar.timeline(for: model.tasks, day: model.todayString)
    }

    public init() {}

    public var body: some View {
        IOSPage {
            // Agenda Header Hero
            agendaHeroCard

            // Sync issues banner if any
            IOSSyncIssueBanner()

            // Scheduled Tasks Timeline
            scheduledTasksSection

            // Apple Calendar Events Section
            appleCalendarSection
        }
        .navigationTitle("Calendar")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                IOSSyncStatusIndicator()
            }
        }
        .task {
            appleCalendar.refreshAuthorization()
            appleCalendar.loadEvents(for: model.todayString)
        }
    }

    // MARK: - Agenda Header

    private var agendaHeroCard: some View {
        IOSHeroCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                HStack {
                    Label("DAILY AGENDA", systemImage: "calendar")
                        .font(IOSTypography.kicker)
                        .tracking(1.2)
                        .foregroundStyle(IOSColor.mint(colorScheme))
                    Spacer()
                }

                Text(currentFormattedDate)
                    .font(IOSTypography.title)
                    .foregroundStyle(.white)

                Text("\(items.count) scheduled items · \(appleCalendar.events.count) calendar events")
                    .font(IOSTypography.subheadline)
                    .foregroundStyle(.white.opacity(0.85))
            }
        }
    }

    private var currentFormattedDate: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "EEEE, MMMM d, yyyy"
        return formatter.string(from: Date())
    }

    // MARK: - Scheduled Tasks

    private var scheduledTasksSection: some View {
        IOSSection(title: "Scheduled Work", subtitle: "\(items.count) tasks") {
            if items.isEmpty {
                IOSEmptyState(
                    icon: "calendar.badge.clock",
                    title: "No Scheduled Tasks",
                    description: "Tasks with due dates or start times will appear on today's timeline."
                )
            } else {
                VStack(spacing: IOSSpacing.tight) {
                    ForEach(items) { item in
                        HStack(alignment: .top, spacing: IOSSpacing.compact) {
                            Image(systemName: item.isDue ? "exclamationmark.circle.fill" : "clock.fill")
                                .font(.title3)
                                .foregroundStyle(item.isDue ? IOSColor.coral(colorScheme) : IOSColor.teal(colorScheme))
                                .frame(width: 32, height: 32)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                    .font(IOSTypography.headline)
                                    .foregroundStyle(IOSColor.ink(colorScheme))
                                Text(item.isDue ? "Due at \(displayTime(item.startAt))" : scheduleLabel(item))
                                    .font(IOSTypography.caption)
                                    .foregroundStyle(IOSColor.inkDim(colorScheme))
                            }

                            Spacer()
                        }
                        .padding(IOSSpacing.normal)
                        .background(
                            IOSColor.surface(colorScheme),
                            in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                        )
                        .overlay {
                            RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                                .stroke(IOSColor.borderSoft(colorScheme), lineWidth: 1)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Apple Calendar Section

    private var appleCalendarSection: some View {
        IOSSection(title: "Apple Calendar", subtitle: appleCalendar.authorizationState.title) {
            switch appleCalendar.authorizationState {
            case .notDetermined:
                IOSCard {
                    VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                        Text("Connect Apple Calendar")
                            .font(IOSTypography.headline)
                            .foregroundStyle(IOSColor.ink(colorScheme))
                        Text("Display system events alongside your scheduled tasks for full day clarity.")
                            .font(IOSTypography.subheadline)
                            .foregroundStyle(IOSColor.inkDim(colorScheme))
                        Button("Allow Calendar Access") {
                            Task {
                                await appleCalendar.requestAccess()
                                appleCalendar.loadEvents(for: model.todayString)
                            }
                        }
                        .font(IOSTypography.captionBold)
                        .buttonStyle(.borderedProminent)
                        .tint(IOSColor.teal(colorScheme))
                    }
                }

            case .authorized:
                if appleCalendar.events.isEmpty {
                    IOSEmptyState(
                        icon: "calendar",
                        title: "No Calendar Events",
                        description: "No Apple Calendar events scheduled for today."
                    )
                } else {
                    VStack(spacing: IOSSpacing.tight) {
                        ForEach(appleCalendar.events) { event in
                            HStack(alignment: .top, spacing: IOSSpacing.compact) {
                                Circle()
                                    .fill(IOSColor.teal(colorScheme))
                                    .frame(width: 8, height: 8)
                                    .padding(.top, 6)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(event.title)
                                        .font(IOSTypography.subheadline)
                                        .fontWeight(.medium)
                                        .foregroundStyle(IOSColor.ink(colorScheme))
                                    Text(event.isAllDay ? "All Day · \(event.calendarTitle)" : "\(displayTime(event.startDate)) – \(displayTime(event.endDate)) · \(event.calendarTitle)")
                                        .font(IOSTypography.caption)
                                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                                }

                                Spacer()
                            }
                            .padding(IOSSpacing.normal)
                            .background(
                                IOSColor.surface(colorScheme),
                                in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                            )
                            .overlay {
                                RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                                    .stroke(IOSColor.borderSoft(colorScheme), lineWidth: 1)
                            }
                        }
                    }
                }

            case .writeOnly, .denied, .restricted:
                IOSCard {
                    Text("Calendar access is disabled. Enable calendar access in iOS Settings to view events.")
                        .font(IOSTypography.caption)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                }
            }
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
