import SwiftUI

struct CalendarHoverPopoverView: View {
    let item: CalendarItem

    private var cardColor: Color {
        Color.calendarColor(kind: item.kind, sourceColor: item.color)
    }

    private var isFocus: Bool {
        item.kind == "FOCUS_SESSION"
    }

    private var isExternal: Bool {
        item.kind == "EXTERNAL_EVENT"
    }

    private var isDueOnly: Bool {
        item.kind == "TASK_DUE" || (item.allDay && item.dueAt != nil)
    }

    private var hasDuration: Bool {
        !item.allDay && item.end != nil
    }

    private var sameDay: Bool {
        guard let end = item.end else { return true }
        return Calendar.current.isDate(item.start, inSameDayAs: end)
    }

    private var durationString: String? {
        guard hasDuration, let end = item.end else { return nil }
        let diffMins = max(0, Int(end.timeIntervalSince(item.start) / 60))
        let hrs = diffMins / 60
        let mins = diffMins % 60
        if hrs > 0 && mins > 0 { return "\(hrs)h \(mins)m" }
        if hrs > 0 { return "\(hrs)h" }
        return "\(mins)m"
    }

    private var kindTitle: String {
        if isFocus { return "FOCUS SESSION" }
        if isDueOnly { return "DUE DATE" }
        if isExternal { return "CALENDAR EVENT" }
        return "TASK"
    }

    private var priorityBadgeInfo: (text: String, color: Color)? {
        guard let p = item.priority?.uppercased() else { return nil }
        switch p {
        case "HIGH", "P1": return ("P1 High", iTuTheme.coral)
        case "MEDIUM", "P2": return ("P2 Med", iTuTheme.amber)
        case "LOW", "P3": return ("P3 Low", iTuTheme.syncBlue)
        default: return ("P4 None", iTuTheme.inkDim)
        }
    }

    private var statusBadgeInfo: (text: String, color: Color)? {
        guard let s = item.status?.uppercased() else { return nil }
        switch s {
        case "COMPLETED": return ("Completed", iTuTheme.mint)
        case "IN_PROGRESS": return ("In Progress", iTuTheme.syncBlue)
        case "PLANNED": return ("Planned", iTuTheme.teal)
        case "CANCELED": return ("Canceled", iTuTheme.inkFaint)
        default: return nil
        }
    }

    private var descriptionLines: [String] {
        guard let desc = item.description, !desc.isEmpty else { return [] }
        return desc
            .components(separatedBy: .newlines)
            .flatMap { $0.components(separatedBy: "\\n") }
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Header: Badges & Duration
            HStack(spacing: 6) {
                // Kind Badge
                HStack(spacing: 4) {
                    if isFocus {
                        Image(systemName: "sparkles")
                            .font(.system(size: 8, weight: .bold))
                    }
                    Text(kindTitle)
                        .font(.system(size: 8.5, weight: .bold, design: .monospaced))
                }
                .foregroundStyle(cardColor)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(cardColor.opacity(0.12))
                .clipShape(Capsule())
                .overlay {
                    Capsule().stroke(cardColor.opacity(0.35), lineWidth: 1)
                }

                // Priority Badge
                if let priority = priorityBadgeInfo {
                    Text(priority.text)
                        .font(.system(size: 8.5, weight: .semibold, design: .monospaced))
                        .foregroundStyle(priority.color)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1.5)
                        .background(priority.color.opacity(0.12))
                        .clipShape(Capsule())
                        .overlay {
                            Capsule().stroke(priority.color.opacity(0.3), lineWidth: 1)
                        }
                }

                // Status Badge
                if let status = statusBadgeInfo {
                    Text(status.text)
                        .font(.system(size: 8.5, weight: .semibold, design: .monospaced))
                        .foregroundStyle(status.color)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1.5)
                        .background(status.color.opacity(0.12))
                        .clipShape(Capsule())
                        .overlay {
                            Capsule().stroke(status.color.opacity(0.3), lineWidth: 1)
                        }
                }

                Spacer(minLength: 4)

                // Duration Tag
                if let duration = durationString {
                    Text(duration)
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1.5)
                        .background(iTuTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                }
            }

            // Title
            Text(item.title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)

            // Source / Project
            HStack(spacing: 6) {
                Circle()
                    .fill(cardColor)
                    .frame(width: 7, height: 7)
                Text(item.sourceName ?? (isFocus ? "Focus" : isExternal ? "Subscription" : "Inbox"))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(iTuTheme.inkDim)
                    .lineLimit(1)
            }

            // Date & Time Box
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 5) {
                    Image(systemName: "clock")
                        .font(.system(size: 10))
                        .foregroundStyle(iTuTheme.inkDim)

                    if isDueOnly {
                        Text("Due \(formatDate(item.dueAt ?? item.start)) · \(formatTime(item.dueAt ?? item.start))")
                            .font(.system(size: 10.5, weight: .semibold, design: .monospaced))
                            .foregroundStyle(iTuTheme.amber)
                    } else if item.allDay {
                        Text("All day · \(formatDate(item.start))")
                            .font(.system(size: 10.5, weight: .medium, design: .monospaced))
                            .foregroundStyle(iTuTheme.ink)
                    } else {
                        Text(timeString)
                            .font(.system(size: 10.5, weight: .medium, design: .monospaced))
                            .foregroundStyle(iTuTheme.ink)
                    }
                }

                if let tz = item.timeZone, !tz.isEmpty, tz != TimeZone.current.identifier {
                    Text("Timezone: \(tz)")
                        .font(.system(size: 9.5, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                        .padding(.leading, 15)
                }
            }
            .padding(7)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(iTuTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .stroke(iTuTheme.borderSoft, lineWidth: 1)
            }

            // Location
            if let loc = item.location, !loc.isEmpty {
                HStack(alignment: .top, spacing: 5) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 10))
                        .foregroundStyle(iTuTheme.inkDim)
                        .padding(.top, 1)
                    Text(loc)
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                        .lineLimit(2)
                }
            }

            // Description / Notes
            if !descriptionLines.isEmpty {
                HStack(alignment: .top, spacing: 5) {
                    Image(systemName: "doc.text")
                        .font(.system(size: 10))
                        .foregroundStyle(iTuTheme.inkDim)
                        .padding(.top, 1)
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(Array(descriptionLines.prefix(4).enumerated()), id: \.offset) { _, line in
                            Text(line)
                                .font(.system(size: 11))
                                .foregroundStyle(iTuTheme.inkDim)
                                .lineLimit(2)
                        }
                    }
                }
                .padding(.top, 2)
            }

            Divider()
                .background(iTuTheme.borderSoft)

            // Footer
            Text(item.readOnly ? "Read-only item" : "Click to edit · Drag to reschedule")
                .font(.system(size: 9.5, design: .monospaced))
                .foregroundStyle(iTuTheme.inkFaint)
        }
        .padding(12)
        .frame(width: 270)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(
                topLeadingRadius: 10,
                bottomLeadingRadius: 10,
                bottomTrailingRadius: 0,
                topTrailingRadius: 0
            )
            .fill(cardColor)
            .frame(width: 3.5)
        }
    }

    private var timeString: String {
        let startStr = "\(formatDate(item.start)) · \(formatTime(item.start))"
        guard hasDuration, let end = item.end else { return startStr }
        if sameDay {
            return "\(formatDate(item.start)) · \(formatTime(item.start)) – \(formatTime(end))"
        } else {
            return "\(formatDate(item.start)) \(formatTime(item.start)) – \(formatDate(end)) \(formatTime(end))"
        }
    }

    private func formatTime(_ date: Date) -> String {
        iTuDateSupport.calendarTimeFormatter.string(from: date)
    }

    private func formatDate(_ date: Date) -> String {
        iTuDateSupport.calendarShortDateFormatter.string(from: date)
    }
}
