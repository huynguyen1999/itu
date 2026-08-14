import SwiftUI
import AppKit

struct CalendarEventDetailView: View {
    let item: CalendarItem
    var onClose: () -> Void

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

    private var kindTitle: String {
        if isFocus { return "FOCUS SESSION" }
        if isDueOnly { return "DUE DATE" }
        if isExternal { return "CALENDAR EVENT" }
        return "TASK"
    }

    private var dateLabel: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "EEEE, MMMM d"
        return formatter.string(from: item.dueAt ?? item.start)
    }

    private var timeLabel: String {
        if isDueOnly {
            return "Due \(formatTime(item.dueAt ?? item.start))"
        }
        if item.allDay {
            return "All day"
        }
        let startStr = formatTime(item.start)
        guard hasDuration, let end = item.end else { return startStr }
        if Calendar.current.isDate(item.start, inSameDayAs: end) {
            return "\(startStr) – \(formatTime(end))"
        } else {
            let endFormatter = DateFormatter()
            endFormatter.dateFormat = "MMM d, h:mm a"
            return "\(startStr) – \(endFormatter.string(from: end))"
        }
    }

    private var showTimeZone: Bool {
        guard let tz = item.timeZone, !tz.isEmpty else { return false }
        return tz != TimeZone.current.identifier
    }

    private var locationURL: URL? {
        guard let loc = item.location, !loc.isEmpty,
              let encoded = loc.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) else { return nil }
        return URL(string: "https://www.google.com/maps/search/?api=1&query=\(encoded)")
    }

    private var descriptionLines: [String] {
        guard let desc = item.description, !desc.isEmpty else { return [] }
        return desc
            .components(separatedBy: .newlines)
            .flatMap { $0.components(separatedBy: "\\n") }
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
    }

    private var footerLabel: String {
        if isExternal {
            return "Read-only · synced from external calendar"
        }
        if isFocus {
            return "Read-only · Focus Session history"
        }
        if isDueOnly {
            return "Read-only · Due Date"
        }
        if item.readOnly {
            return "Read-only · Task"
        }
        return "Editable task"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header: Category kicker, Title, Close Button
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(kindTitle)
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .tracking(1.2)
                        .foregroundStyle(cardColor)

                    Text(item.title)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(iTuTheme.ink)
                        .lineLimit(4)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 8)

                Button("Close") {
                    onClose()
                }
                .buttonStyle(iTuGhostButtonStyle(height: 28))
                .accessibilityLabel("Close details")
            }
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 14)

            Rectangle()
                .fill(iTuTheme.borderSoft)
                .frame(height: 1)

            // Info rows with subtle horizontal dividers
            VStack(alignment: .leading, spacing: 0) {
                // Source Row
                HStack(alignment: .center, spacing: 10) {
                    Image(systemName: "calendar")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                        .frame(width: 18)

                    Text(item.sourceName ?? (isFocus ? "Focus" : isExternal ? "Calendar" : "Inbox"))
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 11)

                Rectangle()
                    .fill(iTuTheme.borderSoft.opacity(0.7))
                    .frame(height: 1)

                // Date & Time Row
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "clock")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                        .frame(width: 18)
                        .padding(.top, 1)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(dateLabel)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(iTuTheme.ink)

                        HStack(spacing: 6) {
                            Text(timeLabel)
                                .font(.system(size: 12.5))
                                .foregroundStyle(iTuTheme.inkDim)

                            if showTimeZone, let tz = item.timeZone {
                                Text(tz)
                                    .font(.system(size: 9.5, weight: .semibold, design: .monospaced))
                                    .foregroundStyle(iTuTheme.inkDim)
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 1.5)
                                    .background(iTuTheme.surfaceMuted)
                                    .clipShape(RoundedRectangle(cornerRadius: 3, style: .continuous))
                                    .overlay {
                                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                                            .stroke(iTuTheme.borderSoft, lineWidth: 1)
                                    }
                            }
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 11)

                // Location Row (if present)
                if let loc = item.location, !loc.isEmpty {
                    Rectangle()
                        .fill(iTuTheme.borderSoft.opacity(0.7))
                        .frame(height: 1)

                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "mappin.and.ellipse")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(iTuTheme.inkDim)
                            .frame(width: 18)
                            .padding(.top, 1)

                        if let url = locationURL {
                            Button {
                                NSWorkspace.shared.open(url)
                            } label: {
                                Text(loc)
                                    .font(.system(size: 13))
                                    .foregroundStyle(iTuTheme.teal)
                                    .underline(color: iTuTheme.teal.opacity(0.6))
                                    .multilineTextAlignment(.leading)
                            }
                            .buttonStyle(.plain)
                            .pointingHandCursor()
                        } else {
                            Text(loc)
                                .font(.system(size: 13))
                                .foregroundStyle(iTuTheme.ink)
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 11)
                }

                // Description Row (if present)
                if !descriptionLines.isEmpty {
                    Rectangle()
                        .fill(iTuTheme.borderSoft.opacity(0.7))
                        .frame(height: 1)

                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "doc.text")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(iTuTheme.inkDim)
                            .frame(width: 18)
                            .padding(.top, 2)

                        VStack(alignment: .leading, spacing: 3) {
                            ForEach(Array(descriptionLines.enumerated()), id: \.offset) { _, line in
                                Text(line)
                                    .font(.system(size: 12.5))
                                    .foregroundStyle(iTuTheme.ink)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 11)
                }
            }

            Rectangle()
                .fill(iTuTheme.borderSoft)
                .frame(height: 1)

            // Footer
            HStack {
                Text(footerLabel)
                    .font(.system(size: 10.5))
                    .foregroundStyle(iTuTheme.inkDim)
                Spacer()
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(iTuTheme.surfaceMuted.opacity(0.5))
        }
        .frame(width: 380)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func formatTime(_ date: Date) -> String {
        iTuDateSupport.calendarTimeFormatter.string(from: date)
    }
}
