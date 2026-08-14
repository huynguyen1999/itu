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
    @State private var isGeneratingAI = false
    @State private var isInsightsOpen = true
    @State private var errorMessage: String? = nil

    private var allDailyReviews: [JournalNoteModel] {
        model.journalNotes.filter { $0.deletedAt == nil && ($0.kind == "DAILY_REVIEW" || $0.dailyReview != nil) }
            .sorted { $0.entryDate > $1.entryDate }
    }

    private var currentReviewNote: JournalNoteModel? {
        allDailyReviews.first { $0.entryDate == selectedDate }
    }

    private var aiInsights: JournalAiInsightsModel? {
        JournalAiInsightsModel(json: currentReviewNote?.dailyReview?.aiInsightsSnapshot)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Header
            HStack(alignment: .bottom, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(iTuTheme.mint)
                            .frame(width: 6, height: 6)
                            .shadow(color: iTuTheme.mint.opacity(0.4), radius: 2)
                        Text("DAILY REFLECTION")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.mint)
                    }

                    Text("Daily Reviews")
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)

                    Text("Evening reflection & daily synthesis")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 8) {
                    HStack(spacing: 8) {
                        HStack(spacing: 4) {
                            Button {
                                changeDateBy(-1)
                            } label: {
                                Image(systemName: "chevron.left")
                                    .font(.system(size: 10, weight: .bold))
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 4)

                            DatePicker("", selection: Binding(
                                get: { ISO8601DateFormatter().date(from: selectedDate + "T00:00:00Z") ?? Date() },
                                set: { selectedDate = iTuCalendarSupport.dayString($0); loadReviewState() }
                            ), displayedComponents: .date)
                            .labelsHidden()

                            Button {
                                changeDateBy(1)
                            } label: {
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 10, weight: .bold))
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 4)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(iTuTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))

                        Button {
                            startTodayReview()
                        } label: {
                            Text("Today")
                                .font(.system(size: 11, weight: .medium))
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }

                    HStack(spacing: 8) {
                        Button {
                            generateAI()
                        } label: {
                            HStack(spacing: 4) {
                                if isGeneratingAI {
                                    ProgressView().controlSize(.small)
                                } else {
                                    Image(systemName: "sparkles")
                                }
                                Text(isGeneratingAI ? "Generating…" : "Generate AI Insights")
                            }
                        }
                        .buttonStyle(iTuSecondaryButtonStyle(height: 32))
                        .disabled(isGeneratingAI || currentReviewNote == nil)

                        Button {
                            saveDailyReview()
                        } label: {
                            Text(isSaving ? "Saving…" : "Save Daily Review")
                        }
                        .buttonStyle(iTuPrimaryButtonStyle(height: 32))
                        .disabled(isSaving)
                    }
                }
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.coral)
                    .padding(8)
                    .background(iTuTheme.coralTint)
                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            }

            // Compact Ledger Row
            ledgerSection

            // Main Content: 2-Column (Questions on left, AI Insights on right)
            HStack(alignment: .top, spacing: 18) {
                // Left Column: 4 Questions
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("ENTRY — FOUR QUESTIONS")
                                .font(.system(size: 9, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)
                            Text("How the day actually went")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(iTuTheme.ink)
                        }
                        Spacer()
                    }
                    .padding(.bottom, 4)

                    questionRow(
                        markColor: iTuTheme.teal,
                        prompt: "What went well?",
                        placeholder: "Wins, accomplishments, positive moments, flow state…",
                        text: $wentWell
                    )

                    questionRow(
                        markColor: iTuTheme.amber,
                        prompt: "What felt difficult or distracting?",
                        placeholder: "Friction points, interruptions, blockers, fatigue…",
                        text: $friction
                    )

                    questionRow(
                        markColor: iTuTheme.teal,
                        prompt: "What did I learn or notice?",
                        placeholder: "Insights, patterns, realizations, surprises…",
                        text: $learned
                    )

                    questionRow(
                        markColor: iTuTheme.teal,
                        prompt: "Anything important the data doesn't show?",
                        placeholder: "Qualitative context, mood, conversations, serendipity…",
                        text: $context
                    )
                }
                .padding(16)
                .background(iTuTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))
                .frame(maxWidth: .infinity)

                // Right Column: Collapsible AI Insights Panel
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("AI Insights")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(iTuTheme.ink)
                            Text(aiInsights != nil ? "\(aiInsights!.insights.count) findings from today" : "Daily data synthesis")
                                .font(.system(size: 10))
                                .foregroundStyle(iTuTheme.inkDim)
                        }

                        Spacer()

                        if aiInsights != nil {
                            Button {
                                withAnimation(.easeInOut(duration: 0.15)) {
                                    isInsightsOpen.toggle()
                                }
                            } label: {
                                HStack(spacing: 3) {
                                    Text(isInsightsOpen ? "Hide" : "Show")
                                    Image(systemName: isInsightsOpen ? "chevron.up" : "chevron.down")
                                }
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(iTuTheme.teal)
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    Divider()

                    if isGeneratingAI {
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.small)
                            Text("Analyzing activity & reflections…")
                                .font(.system(size: 11))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                        .padding(.vertical, 12)
                    } else if let insights = aiInsights, isInsightsOpen {
                        VStack(alignment: .leading, spacing: 10) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(insights.headline)
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(iTuTheme.ink)
                                Text(insights.summary)
                                    .font(.system(size: 11))
                                    .foregroundStyle(iTuTheme.inkDim)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(.bottom, 4)

                            ForEach(insights.insights) { finding in
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack {
                                        Text(finding.title)
                                            .font(.system(size: 11, weight: .semibold))
                                            .foregroundStyle(iTuTheme.ink)
                                        Spacer()
                                        Text(finding.confidence.uppercased())
                                            .font(.system(size: 8, weight: .bold, design: .monospaced))
                                            .foregroundStyle(finding.confidence == "high" ? iTuTheme.teal : iTuTheme.amber)
                                            .padding(.horizontal, 4)
                                            .padding(.vertical, 1)
                                            .background((finding.confidence == "high" ? iTuTheme.teal : iTuTheme.amber).opacity(0.12))
                                            .clipShape(Capsule())
                                    }
                                    Text(finding.body)
                                        .font(.system(size: 10.5))
                                        .foregroundStyle(iTuTheme.inkDim)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .padding(8)
                                .background(iTuTheme.surfaceMuted)
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            }

                            if !insights.attentionNext.isEmpty {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("WORTH NOTICING NEXT")
                                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                                        .foregroundStyle(iTuTheme.inkFaint)

                                    ForEach(insights.attentionNext, id: \.self) { item in
                                        HStack(alignment: .top, spacing: 5) {
                                            Text("→")
                                                .font(.system(size: 10, weight: .bold))
                                                .foregroundStyle(iTuTheme.teal)
                                            Text(item)
                                                .font(.system(size: 10.5))
                                                .foregroundStyle(iTuTheme.inkDim)
                                        }
                                    }
                                }
                                .padding(.top, 4)
                            }
                        }
                    } else if aiInsights == nil {
                        VStack(spacing: 8) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 20))
                                .foregroundStyle(iTuTheme.teal.opacity(0.7))
                            Text("No insights generated yet.")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(iTuTheme.ink)
                            Text("Save your review and generate an AI synthesis of today's activities and reflections.")
                                .font(.system(size: 10))
                                .foregroundStyle(iTuTheme.inkDim)
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(16)
                    }
                }
                .padding(16)
                .frame(width: 280)
                .background(iTuTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))
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

    private var ledgerSection: some View {
        let tasksDone = model.tasks.filter { $0.status == .completed && $0.deletedAt == nil }.count
        let focusMinutes = model.focusTimer.history
            .filter { $0.completedAt?.starts(with: selectedDate) == true }
            .reduce(0) { total, session in total + ((session.plannedSeconds ?? 0) / 60) }
        let habitsScheduled = model.habits.filter { $0.archivedAt == nil }.count
        let habitsCompleted = model.habitOccurrences.filter { $0.localDayString == selectedDate && $0.status == .completed }.count

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("TODAY'S LEDGER")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
                Spacer()
                Text(selectedDate)
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 8), spacing: 8) {
                ledgerItem(icon: "checkmark.circle", label: "Tasks", value: "\(tasksDone) done", badge: "\(tasksDone) done", isPositive: tasksDone > 0)
                ledgerItem(icon: "clock", label: "Focus", value: "\(focusMinutes)m", badge: "\(focusMinutes)m", isPositive: focusMinutes > 0)
                ledgerItem(icon: "bolt", label: "Habits", value: "\(habitsCompleted)/\(habitsScheduled)", badge: "\(habitsScheduled > 0 ? (habitsCompleted * 100 / habitsScheduled) : 0)% rate", isPositive: habitsScheduled > 0 && habitsCompleted >= habitsScheduled / 2)
                ledgerItem(icon: "dumbbell", label: "Training", value: "0 sess.", badge: "0 logged", isPositive: false)
                ledgerItem(icon: "creditcard", label: "Spending", value: "₫0", badge: "tracked", isPositive: false)
                ledgerItem(icon: "sparkles", label: "Learning", value: "0 rev.", badge: "0 rev.", isPositive: false)
                ledgerItem(icon: "flame", label: "Apps", value: "tracked", badge: "tracked", isPositive: false)
                ledgerItem(icon: "globe", label: "Websites", value: "tracked", badge: "tracked", isPositive: false)
            }
        }
        .padding(14)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))
    }

    private func ledgerItem(icon: String, label: String, value: String, badge: String, isPositive: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 9))
                    .foregroundStyle(iTuTheme.teal)
                Text(label)
                    .font(.system(size: 9.5))
                    .foregroundStyle(iTuTheme.inkDim)
            }
            Text(value)
                .font(.system(size: 13, weight: .semibold, design: .monospaced))
                .foregroundStyle(iTuTheme.ink)
            Text(badge)
                .font(.system(size: 8.5, design: .monospaced))
                .foregroundStyle(isPositive ? iTuTheme.teal : iTuTheme.inkFaint)
                .padding(.horizontal, 4)
                .padding(.vertical, 1)
                .background((isPositive ? iTuTheme.teal : iTuTheme.inkFaint).opacity(0.1))
                .clipShape(Capsule())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func questionRow(markColor: Color, prompt: String, placeholder: String, text: Binding<String>) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("”")
                .font(.system(size: 18, weight: .bold, design: .serif))
                .italic()
                .foregroundStyle(markColor)
                .frame(width: 14)

            VStack(alignment: .leading, spacing: 4) {
                Text(prompt)
                    .font(.system(size: 12, weight: .medium, design: .serif))
                    .italic()
                    .foregroundStyle(iTuTheme.ink)

                TextField(placeholder, text: text, axis: .vertical)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
                    .padding(8)
                    .background(iTuTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(iTuTheme.borderSoft, lineWidth: 1))
                    .lineLimit(2...5)
            }
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

    private func changeDateBy(_ offset: Int) {
        let cal = iTuCalendarSupport.calendar()
        guard let current = ISO8601DateFormatter().date(from: selectedDate + "T00:00:00Z"),
              let next = cal.date(byAdding: .day, value: offset, to: current) else { return }
        selectedDate = iTuCalendarSupport.dayString(next)
        loadReviewState()
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

    private func generateAI() {
        guard let noteID = currentReviewNote?.id else {
            errorMessage = "Save review before generating AI insights."
            return
        }
        isGeneratingAI = true
        errorMessage = nil
        Task {
            let error = await model.generateReviewInsights(entryID: noteID)
            if let error {
                errorMessage = error
            } else {
                isInsightsOpen = true
            }
            isGeneratingAI = false
        }
    }

    private func saveDailyReview() {
        isSaving = true
        errorMessage = nil
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

        ### Context & qualitative notes
        \(context)
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
