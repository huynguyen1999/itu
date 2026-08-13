import SwiftUI

enum CalendarEventCardDensity {
    case regular
    case compact
}

struct CalendarItem: Identifiable, Sendable, Hashable {
    let id: String
    let title: String
    let start: Date
    let end: Date?
    let kind: String
    let taskID: String?
    let readOnly: Bool
    let allDay: Bool
    let dueAt: Date?
    let sourceID: String?
    let sourceName: String?
    let color: String?
    let priority: String?
    let description: String?
    let location: String?
    let timeZone: String?

    init(
        id: String,
        title: String,
        start: Date,
        end: Date?,
        kind: String,
        taskID: String?,
        readOnly: Bool,
        allDay: Bool,
        dueAt: Date? = nil,
        sourceID: String?,
        sourceName: String?,
        color: String?,
        priority: String?,
        description: String? = nil,
        location: String? = nil,
        timeZone: String? = nil
    ) {
        self.id = id; self.title = title; self.start = start; self.end = end
        self.kind = kind; self.taskID = taskID; self.readOnly = readOnly; self.allDay = allDay
        self.dueAt = dueAt; self.sourceID = sourceID; self.sourceName = sourceName; self.color = color
        self.priority = priority; self.description = description; self.location = location; self.timeZone = timeZone
    }
}

extension Color {
    static func fromHex(_ hexString: String?) -> Color? {
        guard let hexString, !hexString.isEmpty else { return nil }
        var cleaned = hexString.trimmingCharacters(in: .whitespacesAndNewlines)
        if cleaned.hasPrefix("#") {
            cleaned.removeFirst()
        }
        guard let value = UInt32(cleaned, radix: 16) else { return nil }
        return Color(hex: value)
    }
}

struct CalendarEventCard: View {
    let item: CalendarItem
    var density: CalendarEventCardDensity = .regular
    var titleLineLimit: Int = 1
    var showsMetadata: Bool = true
    var onSelect: (() -> Void)? = nil

    private var isCompact: Bool { density == .compact }

    private var cardColor: Color {
        Color.calendarColor(kind: item.kind, sourceColor: item.color)
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

    private var showsDateLabels: Bool {
        hasDuration && !sameDay
    }

    var body: some View {
        VStack(alignment: .leading, spacing: isCompact ? 2 : 4) {
            // Title
            Text(item.title)
                .font(.system(size: isCompact ? 11 : 12.5, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
                .lineLimit(isCompact ? titleLineLimit : 2)

            // Time / Due section with divider
            if showsMetadata && isDueOnly {
                Divider().background(Color.white.opacity(0.12))
                Text("Due \(formatTime(item.dueAt ?? item.start))")
                    .font(.system(size: isCompact ? 9 : 10.5, weight: .medium, design: .monospaced))
                    .foregroundStyle(iTuTheme.amber)
            } else if showsMetadata && (hasDuration || !item.allDay) {
                Divider().background(Color.white.opacity(0.12))
                VStack(alignment: .leading, spacing: 1) {
                    timeLabel(item.start, fontSize: isCompact ? 8.5 : 9.5)
                    if hasDuration, let end = item.end {
                        Text("↓")
                            .font(.system(size: 8))
                            .foregroundStyle(iTuTheme.inkFaint)
                        timeLabel(end, fontSize: isCompact ? 8.5 : 9.0, opacity: 0.8)
                    }
                }
            }
        }
        .padding(.leading, isCompact ? 10 : 14)
        .padding(.trailing, isCompact ? 6 : 10)
        .padding(.vertical, isCompact ? 2 : 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(cardColor.opacity(isCompact ? 0.16 : 0.18))
        .clipShape(RoundedRectangle(cornerRadius: isCompact ? 6 : 9, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: isCompact ? 6 : 9, style: .continuous)
                .stroke(cardColor.opacity(0.4), lineWidth: 1)
        }
        .overlay(alignment: .leading) {
            UnevenRoundedRectangle(
                topLeadingRadius: isCompact ? 6 : 9,
                bottomLeadingRadius: isCompact ? 6 : 9,
                bottomTrailingRadius: 0,
                topTrailingRadius: 0
            )
            .fill(cardColor)
            .frame(width: isCompact ? 2.5 : 3.5)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            onSelect?()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(item.title), \(item.kind == "TASK_DUE" ? "Due Date" : "Task")\(item.readOnly ? ", read only" : "")")
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: date)
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }

    @ViewBuilder
    private func timeLabel(_ date: Date, fontSize: CGFloat, opacity: Double = 1) -> some View {
        if showsDateLabels && isCompact {
            Text("\(formatTime(date)) · \(formatDate(date))")
                .font(.system(size: fontSize, weight: .medium, design: .monospaced))
                .foregroundStyle(iTuTheme.inkDim.opacity(opacity))
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Text(formatTime(date))
                    .font(.system(size: fontSize, weight: .medium, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim.opacity(opacity))
                if showsDateLabels {
                    Text(formatDate(date))
                        .font(.system(size: 8, weight: .medium, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                }
            }
        }
    }
}

extension Color {
    static func calendarColor(kind: String, sourceColor: String?) -> Color {
        if let hex = fromHex(sourceColor) { return hex }
        switch sourceColor?.uppercased() {
        case "TEAL": return iTuTheme.teal
        case "BLUE": return iTuTheme.syncBlue
        case "AMBER": return iTuTheme.amber
        case "CORAL", "ROSE": return iTuTheme.coral
        case "VIOLET", "FOCUS": return Color(hex: 0x8B6FC9)
        case "EMERALD": return iTuTheme.mint
        default: break
        }
        if kind == "FOCUS_SESSION" { return Color(hex: 0x8B6FC9) }
        if kind == "TASK_DUE" { return iTuTheme.amber }
        return iTuTheme.teal
    }
}
