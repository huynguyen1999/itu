import SwiftUI

struct DailyReviewsView: View {
    @Environment(AppModel.self) private var model
    var onSelectNote: (JournalNoteModel) -> Void

    @State private var selectedDate = iTuCalendarSupport.dayString()
    @State private var wentWell = ""
    @State private var friction = ""
    @State private var learned = ""
    @State private var context = ""
    @State private var isSaving = false
    @State private var isCreatingReview = false

    private var allDailyReviews: [JournalNoteModel] {
        model.journalNotes.filter { $0.deletedAt == nil && ($0.kind == "DAILY_REVIEW" || $0.dailyReview != nil) }
            .sorted { $0.entryDate > $1.entryDate }
    }

    private var currentReviewNote: JournalNoteModel? {
        allDailyReviews.first { $0.entryDate == selectedDate }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Header Action
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("DAILY REVIEWS & REFLECTION")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.mint)
                    Text("Daily Reviews")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                }

                Spacer()

                Button {
                    startTodayReview()
                } label: {
                    Label("Review Today", systemImage: "sun.max.fill")
                }
                .buttonStyle(.borderedProminent)
                .tint(iTuTheme.teal)
            }

            // Reflection Form
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Reflection for \(selectedDate)")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(iTuTheme.ink)

                    Spacer()

                    DatePicker("", selection: Binding(
                        get: { ISO8601DateFormatter().date(from: selectedDate + "T00:00:00Z") ?? Date() },
                        set: { selectedDate = iTuCalendarSupport.dayString($0); loadReviewState() }
                    ), displayedComponents: .date)
                    .labelsHidden()
                }

                Divider()

                VStack(alignment: .leading, spacing: 6) {
                    Text("WHAT WENT WELL?")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.teal)
                    TextField("Accomplishments, highlights, wins…", text: $wentWell, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(3...6)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("FRICTION & CHALLENGES")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.coral)
                    TextField("Blockers, distractions, delays…", text: $friction, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(3...6)
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("WHAT DID YOU LEARN?")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.amber)
                    TextField("Insights, adjustments for tomorrow…", text: $learned, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(2...4)
                }

                HStack {
                    Spacer()
                    Button(isSaving ? "Saving…" : "Save Daily Review") {
                        saveDailyReview()
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

            // Past Daily Reviews List
            VStack(alignment: .leading, spacing: 10) {
                Text("PAST REVIEWS (\(allDailyReviews.count))")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                if allDailyReviews.isEmpty {
                    Text("No daily reviews recorded yet.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    LazyVStack(spacing: 8) {
                        ForEach(allDailyReviews) { reviewNote in
                            Button {
                                onSelectNote(reviewNote)
                            } label: {
                                reviewRow(reviewNote)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .onAppear {
            loadReviewState()
        }
    }

    private func reviewRow(_ note: JournalNoteModel) -> some View {
        HStack(spacing: 12) {
            Circle()
                .fill(iTuTheme.teal.opacity(0.15))
                .frame(width: 28, height: 28)
                .overlay {
                    Image(systemName: "sun.max.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.teal)
                }

            VStack(alignment: .leading, spacing: 2) {
                Text(note.title.isEmpty ? "Daily Review: \(note.displayDate)" : note.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                Text(note.previewText)
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
                    .lineLimit(1)
            }

            Spacer()

            Text(note.displayDate)
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(12)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }

    private func startTodayReview() {
        selectedDate = iTuCalendarSupport.dayString()
        loadReviewState()
    }

    private func loadReviewState() {
        if let review = currentReviewNote?.dailyReview {
            wentWell = review.wentWellMarkdown ?? ""
            friction = review.frictionMarkdown ?? ""
            learned = review.learnedMarkdown ?? ""
            context = review.contextMarkdown ?? ""
        } else {
            wentWell = ""
            friction = ""
            learned = ""
            context = ""
        }
    }

    private func saveDailyReview() {
        isSaving = true
        let noteID = currentReviewNote?.id
        let rev = JournalDailyReviewModel(
            entryId: noteID ?? ULID.generate(),
            periodDate: selectedDate,
            summarySnapshot: [:],
            wentWellMarkdown: wentWell.isEmpty ? nil : wentWell,
            frictionMarkdown: friction.isEmpty ? nil : friction,
            learnedMarkdown: learned.isEmpty ? nil : learned,
            contextMarkdown: context.isEmpty ? nil : context
        )
        let md = """
        # Daily Review: \(selectedDate)

        ### What went well
        \(wentWell)

        ### Friction & Challenges
        \(friction)

        ### What was learned
        \(learned)
        """
        Task {
            _ = await model.saveDailyReview(
                id: noteID,
                title: "Daily Review: \(selectedDate)",
                contentMarkdown: md,
                entryDate: selectedDate,
                review: rev
            )
            isSaving = false
        }
    }
}
