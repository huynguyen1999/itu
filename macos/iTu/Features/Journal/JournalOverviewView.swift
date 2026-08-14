import SwiftUI

struct JournalOverviewView: View {
    @Environment(AppModel.self) private var model
    var onSelectNote: (JournalNoteModel) -> Void
    var onNewDailyNote: () -> Void
    var onNewDailyReview: () -> Void
    var onNewWeeklyReview: () -> Void

    private var allNotes: [JournalNoteModel] {
        model.journalNotes.filter { $0.deletedAt == nil }
    }

    private var recentNotes: [JournalNoteModel] {
        allNotes.sorted { $0.updatedAt > $1.updatedAt }.prefix(6).map { $0 }
    }

    private var todayStr: String {
        iTuCalendarSupport.dayString()
    }

    private var todayNote: JournalNoteModel? {
        allNotes.first { $0.kind == "DAILY" && $0.entryDate == todayStr }
    }

    private var todayReview: JournalNoteModel? {
        allNotes.first { ($0.kind == "DAILY_REVIEW" || $0.dailyReview != nil) && $0.entryDate == todayStr }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Today's Action Hero Banner
            HStack(spacing: 16) {
                Image(systemName: "sun.and.horizon.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(iTuTheme.teal)

                VStack(alignment: .leading, spacing: 3) {
                    Text("TODAY'S JOURNAL · \(todayStr)")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.mint)

                    Text(todayNote != nil ? "Today's daily note is active" : "Capture today's thoughts & progress")
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)

                    Text(todayReview != nil ? "Daily reflection completed." : "Write your daily note or log evening reflection.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                }

                Spacer()

                HStack(spacing: 8) {
                    if let todayNote {
                        Button {
                            onSelectNote(todayNote)
                        } label: {
                            Label("Open Today", systemImage: "doc.text")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.regular)
                    } else {
                        Button {
                            onNewDailyNote()
                        } label: {
                            Label("Today's Note", systemImage: "plus")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(iTuTheme.teal)
                        .controlSize(.regular)
                    }

                    Button {
                        onNewDailyReview()
                    } label: {
                        Label("Review Today", systemImage: "sun.max")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.regular)
                }
            }
            .padding(16)
            .background(iTuTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(iTuTheme.border, lineWidth: 1)
            }

            // 3 Summary Cards
            HStack(spacing: 14) {
                metricCard(
                    title: "TOTAL NOTES",
                    value: "\(allNotes.count)",
                    subtitle: "Personal documents",
                    tint: iTuTheme.teal
                )
                metricCard(
                    title: "DAILY REVIEWS",
                    value: "\(allNotes.filter { $0.kind == "DAILY_REVIEW" || $0.dailyReview != nil }.count)",
                    subtitle: "Reflections logged",
                    tint: iTuTheme.amber
                )
                metricCard(
                    title: "WEEKLY REVIEWS",
                    value: "\(allNotes.filter { $0.kind == "WEEKLY_REVIEW" || $0.weeklyReview != nil }.count)",
                    subtitle: "Syntheses created",
                    tint: iTuTheme.mint
                )
            }

            // Recent Notes
            VStack(alignment: .leading, spacing: 12) {
                Text("RECENT JOURNAL NOTES")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                if recentNotes.isEmpty {
                    Text("No journal notes found. Create your first note from the sidebar.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 260, maximum: 380), spacing: 12)], spacing: 12) {
                        ForEach(recentNotes) { note in
                            Button {
                                onSelectNote(note)
                            } label: {
                                noteCard(note)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }

    private func metricCard(title: String, value: String, subtitle: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(tint)
            Text(value)
                .font(.system(size: 18, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.ink)
            Text(subtitle)
                .font(.system(size: 10))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }

    private func noteCard(_ note: JournalNoteModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(note.title.isEmpty ? "Untitled Note" : note.title)
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                    .lineLimit(1)

                Spacer()

                if note.kind != "NOTE" {
                    Text(note.kind.replacingOccurrences(of: "_", with: " "))
                        .font(.system(size: 8, weight: .bold))
                        .foregroundStyle(iTuTheme.teal)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(iTuTheme.teal.opacity(0.1))
                        .clipShape(Capsule())
                }
            }

            Text(note.previewText)
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkDim)
                .lineLimit(3)

            Divider()

            HStack {
                Text(note.displayDate)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                Spacer()

                if !note.tags.isEmpty {
                    Text("\(note.tags.count) tags")
                        .font(.system(size: 10))
                        .foregroundStyle(iTuTheme.teal)
                }
            }
        }
        .padding(12)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }
}
