import SwiftUI

struct WeeklyReviewsView: View {
    @Environment(AppModel.self) private var model
    var onSelectNote: (JournalNoteModel) -> Void

    @State private var periodStart = ""
    @State private var periodEnd = ""
    @State private var wentWell = ""
    @State private var friction = ""
    @State private var learned = ""
    @State private var different = ""
    @State private var nextWeek = ""
    @State private var isSaving = false
    @State private var isGeneratingAI = false

    private var allWeeklyReviews: [JournalNoteModel] {
        model.journalNotes.filter { $0.deletedAt == nil && ($0.kind == "WEEKLY_REVIEW" || $0.weeklyReview != nil) }
            .sorted { $0.entryDate > $1.entryDate }
    }

    private var currentReviewNote: JournalNoteModel? {
        allWeeklyReviews.first { $0.weeklyReview?.periodStart == periodStart }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("WEEKLY SYNTHESIS & GOALS")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.mint)
                    Text("Weekly Reviews")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                }

                Spacer()

                Button {
                    selectCurrentWeek()
                } label: {
                    Label("This Week", systemImage: "sparkles")
                }
                .buttonStyle(.borderedProminent)
                .tint(iTuTheme.teal)
            }

            // Review Form
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Period: \(periodStart) → \(periodEnd)")
                        .font(.system(size: 13, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.ink)

                    Spacer()
                }

                Divider()

                VStack(alignment: .leading, spacing: 6) {
                    Text("WHAT WENT WELL THIS WEEK?")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.teal)
                    TextField("Key deliverables, habits kept, highlights…", text: $wentWell, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(3...5)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("WHAT CAUSED FRICTION?")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.coral)
                    TextField("Bottlenecks, time sinks, unexpected obstacles…", text: $friction, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(3...5)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("KEY LESSONS LEARNED")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.amber)
                    TextField("Takeaways and mental model updates…", text: $learned, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(2...4)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("NEXT WEEK FOCUS & GOALS")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.forest)
                    TextField("Top priorities and commitments for next week…", text: $nextWeek, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(2...4)
                }

                // AI Insights Card if available
                if let aiInsights = currentReviewNote?.weeklyReview?.aiInsightsSnapshot?.stringValue, !aiInsights.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Label("AI SYNTHESIS", systemImage: "sparkles")
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.teal)
                        Text(aiInsights)
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.ink)
                    }
                    .padding(10)
                    .background(iTuTheme.teal.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }

                HStack {
                    Spacer()
                    Button(isSaving ? "Saving…" : "Save Weekly Review") {
                        saveWeeklyReview()
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(iTuTheme.teal)
                    .disabled(isSaving)
                }
            }
            .padding(16)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(iTuTheme.border, lineWidth: 1)
            }

            // Past Weekly Reviews List
            VStack(alignment: .leading, spacing: 10) {
                Text("PAST WEEKLY REVIEWS (\(allWeeklyReviews.count))")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                if allWeeklyReviews.isEmpty {
                    Text("No weekly reviews recorded yet.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    LazyVStack(spacing: 8) {
                        ForEach(allWeeklyReviews) { reviewNote in
                            Button {
                                onSelectNote(reviewNote)
                            } label: {
                                weeklyRow(reviewNote)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .onAppear {
            if periodStart.isEmpty {
                selectCurrentWeek()
            }
        }
    }

    private func weeklyRow(_ note: JournalNoteModel) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(iTuTheme.teal.opacity(0.15))
                .frame(width: 28, height: 28)
                .overlay {
                    Image(systemName: "sparkles")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.teal)
                }

            VStack(alignment: .leading, spacing: 2) {
                Text(note.title.isEmpty ? "Weekly Review: \(note.displayDate)" : note.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                Text(note.previewText)
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
                    .lineLimit(1)
            }

            Spacer()

            if let rev = note.weeklyReview {
                Text("\(rev.periodStart) · \(rev.periodEnd)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
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

    private func selectCurrentWeek() {
        let range = iTuCalendarSupport.weekRange(weekStartDay: model.settingsStore.journalWeekStartDay)
        periodStart = range.start
        periodEnd = range.end
        loadReviewState()
    }

    private func loadReviewState() {
        if let rev = currentReviewNote?.weeklyReview {
            wentWell = rev.wentWellMarkdown ?? ""
            friction = rev.frictionMarkdown ?? ""
            learned = rev.learnedMarkdown ?? ""
            different = rev.differentFromLastWeekMarkdown ?? ""
            nextWeek = rev.nextWeekMarkdown ?? ""
        } else {
            wentWell = ""
            friction = ""
            learned = ""
            different = ""
            nextWeek = ""
        }
    }

    private func saveWeeklyReview() {
        isSaving = true
        let noteID = currentReviewNote?.id
        let rev = JournalWeeklyReviewModel(
            entryId: noteID ?? ULID.generate(),
            periodStart: periodStart,
            periodEnd: periodEnd,
            summarySnapshot: [:],
            wentWellMarkdown: wentWell.isEmpty ? nil : wentWell,
            frictionMarkdown: friction.isEmpty ? nil : friction,
            learnedMarkdown: learned.isEmpty ? nil : learned,
            differentFromLastWeekMarkdown: different.isEmpty ? nil : different,
            nextWeekMarkdown: nextWeek.isEmpty ? nil : nextWeek
        )
        let md = """
        # Weekly Review: \(periodStart) to \(periodEnd)

        ### What went well
        \(wentWell)

        ### Friction
        \(friction)

        ### Lessons learned
        \(learned)

        ### Next week focus
        \(nextWeek)
        """
        Task {
            _ = await model.saveWeeklyReview(
                id: noteID,
                title: "Weekly Review: \(periodStart) to \(periodEnd)",
                contentMarkdown: md,
                entryDate: periodEnd,
                review: rev
            )
            isSaving = false
        }
    }
}
