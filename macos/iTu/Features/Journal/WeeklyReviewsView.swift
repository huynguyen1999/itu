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
    @State private var isInsightsOpen = true
    @State private var summaryData: [String: JSONValue]? = nil
    @State private var errorMessage: String? = nil

    private var allWeeklyReviews: [JournalNoteModel] {
        model.journalNotes.filter { $0.deletedAt == nil && ($0.kind == "WEEKLY_REVIEW" || $0.weeklyReview != nil) }
            .sorted { $0.entryDate > $1.entryDate }
    }

    private var currentReviewNote: JournalNoteModel? {
        allWeeklyReviews.first { $0.weeklyReview?.periodStart == periodStart }
    }

    private var aiInsights: JournalAiInsightsModel? {
        JournalAiInsightsModel(json: currentReviewNote?.weeklyReview?.aiInsightsSnapshot)
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
                        Text("WEEKLY WRITING")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.mint)
                    }

                    Text("Weekly Reviews")
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)

                    Text("Reflection & weekly synthesis")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)

                    // Week track days
                    HStack(spacing: 6) {
                        ForEach(weekDays(), id: \.dateStr) { day in
                            VStack(spacing: 3) {
                                Circle()
                                    .fill(day.isFilled ? iTuTheme.teal : iTuTheme.surfaceMuted)
                                    .overlay(Circle().stroke(day.isFilled ? iTuTheme.teal : iTuTheme.border, lineWidth: 1))
                                    .frame(width: 7, height: 7)
                                Text(day.label)
                                    .font(.system(size: 9, weight: day.isToday ? .bold : .regular, design: .monospaced))
                                    .foregroundStyle(day.isToday ? iTuTheme.teal : iTuTheme.inkFaint)
                            }
                        }
                    }
                    .padding(.top, 4)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 8) {
                    HStack(spacing: 8) {
                        Text("\(periodStart) — \(periodEnd)")
                            .font(.system(size: 12, weight: .semibold, design: .monospaced))
                            .foregroundStyle(iTuTheme.ink)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(iTuTheme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))

                        Button {
                            selectCurrentWeek()
                        } label: {
                            Text("This Week")
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
                            saveWeeklyReview()
                        } label: {
                            Text(isSaving ? "Saving…" : "Save Weekly Review")
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
                // Left Column: 5 Questions
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("ENTRY — FIVE QUESTIONS")
                                .font(.system(size: 9, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)
                            Text("How the week actually went")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(iTuTheme.ink)
                        }
                        Spacer()
                    }
                    .padding(.bottom, 4)

                    questionRow(
                        markColor: iTuTheme.teal,
                        prompt: "What went well?",
                        placeholder: "Wins, achievements, positive habits, breakthroughs…",
                        text: $wentWell
                    )

                    questionRow(
                        markColor: iTuTheme.teal,
                        prompt: "What did I learn or notice?",
                        placeholder: "Lessons, observations, patterns, surprises…",
                        text: $learned
                    )

                    questionRow(
                        markColor: iTuTheme.teal,
                        prompt: "What felt different from last week?",
                        placeholder: "Changes in rhythm, energy, context, mindset…",
                        text: $different
                    )

                    questionRow(
                        markColor: iTuTheme.amber,
                        prompt: "What didn't work?",
                        placeholder: "Friction points, blockers, distractions, missed habits…",
                        text: $friction
                    )

                    questionRow(
                        markColor: iTuTheme.teal,
                        prompt: "What I'll try next week",
                        placeholder: "Adjustments, routines, top focus commitments…",
                        text: $nextWeek
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
                            Text(aiInsights != nil ? "\(aiInsights!.insights.count) findings from this week" : "Weekly data synthesis")
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
                            Text("Save your review and generate an AI synthesis of tasks, focus, habits, and reflections.")
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
                            .contextMenu {
                                Button {
                                    onSelectNote(reviewNote)
                                } label: {
                                    Label("Open Review", systemImage: "doc.text")
                                }
                                Divider()
                                Button(role: .destructive) {
                                    Task {
                                        await model.deleteJournalNote(id: reviewNote.id)
                                    }
                                } label: {
                                    Label("Move to Trash", systemImage: "trash")
                                }
                            }
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

    private var ledgerSection: some View {
        let tasks = summaryData?["tasks"]?.objectValue?["completed"]?.intValue ?? 0
        let focus = summaryData?["focus"]?.objectValue?["minutes"]?.intValue ?? 0
        let habitsDone = summaryData?["habits"]?.objectValue?["completed"]?.intValue ?? 0
        let habitsTotal = summaryData?["habits"]?.objectValue?["scheduled"]?.intValue ?? 0
        let workouts = summaryData?["workouts"]?.objectValue?["sessions"]?.intValue ?? 0
        let learning = summaryData?["learning"]?.objectValue?["reviews"]?.intValue ?? 0
        let expensesVND = summaryData?["expenses"]?.objectValue?["VND"]?.intValue ?? 0

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("THIS WEEK'S LEDGER")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
                Spacer()
                Text("vs. last week")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 8), spacing: 8) {
                ledgerItem(icon: "checkmark.circle", label: "Tasks", value: "\(tasks) done", badge: "\(tasks) done", isPositive: tasks > 0)
                ledgerItem(icon: "clock", label: "Focus", value: "\(focus / 60)h \(focus % 60)m", badge: "\(focus)m", isPositive: focus > 0)
                ledgerItem(icon: "bolt", label: "Habits", value: "\(habitsDone)/\(habitsTotal)", badge: "\(habitsTotal > 0 ? (habitsDone * 100 / habitsTotal) : 0)% rate", isPositive: habitsTotal > 0 && habitsDone >= habitsTotal / 2)
                ledgerItem(icon: "dumbbell", label: "Training", value: "\(workouts) sess.", badge: "\(workouts) logged", isPositive: workouts > 0)
                ledgerItem(icon: "creditcard", label: "Spending", value: expensesVND > 0 ? "₫\(expensesVND / 1000)k" : "₫0", badge: expensesVND > 0 ? "tracked" : "no data", isPositive: false)
                ledgerItem(icon: "sparkles", label: "Learning", value: "\(learning) rev.", badge: "\(learning) rev.", isPositive: learning > 0)
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

    private func weekDays() -> [WeekDayInfo] {
        let cal = iTuCalendarSupport.calendar()
        let todayStr = iTuCalendarSupport.dayString()
        guard let startDate = ISO8601DateFormatter().date(from: periodStart + "T00:00:00Z") else { return [] }
        let labels = ["M", "T", "W", "T", "F", "S", "S"]
        var days: [WeekDayInfo] = []
        for i in 0..<7 {
            if let d = cal.date(byAdding: .day, value: i, to: startDate) {
                let dStr = iTuCalendarSupport.dayString(d)
                days.append(WeekDayInfo(label: labels[i], dateStr: dStr, isToday: dStr == todayStr, isFilled: dStr <= todayStr))
            }
        }
        return days
    }

    private func selectCurrentWeek() {
        let range = iTuCalendarSupport.weekRange(weekStartDay: model.settingsStore.journalWeekStartDay)
        periodStart = range.start
        periodEnd = range.end
        loadReviewState()
        loadSummary()
    }

    private func loadSummary() {
        Task {
            summaryData = await model.loadJournalWeeklySummary(periodStart: periodStart, periodEnd: periodEnd)
        }
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

    private func saveWeeklyReview() {
        isSaving = true
        errorMessage = nil
        let noteID = currentReviewNote?.id
        let rev = JournalWeeklyReviewModel(
            entryId: noteID ?? ULID.generate(),
            periodStart: periodStart,
            periodEnd: periodEnd,
            summarySnapshot: summaryData ?? [:],
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

        ### What felt different
        \(different)

        ### Next week focus
        \(nextWeek)
        """
        Task {
            _ = await model.saveWeeklyReview(
                id: noteID,
                title: "Weekly Review — \(periodStart)",
                contentMarkdown: md,
                entryDate: periodEnd,
                review: rev
            )
            isSaving = false
        }
    }
}

private struct WeekDayInfo {
    let label: String
    let dateStr: String
    let isToday: Bool
    let isFilled: Bool
}
