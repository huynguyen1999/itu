import SwiftUI

struct DailyReviewsView: View {
    @Environment(AppModel.self) private var model
    var onSelectNote: (JournalNoteModel) -> Void

    @State private var selectedDate = iTuCalendarSupport.dayString()
    @State private var wentWell = ""
    @State private var friction = ""
    @State private var learned = ""
    @State private var context = ""
    @State private var selectedMood = "🙂"
    @State private var editorMode = "EDIT"
    @State private var isSaving = false
    @State private var isGeneratingAI = false
    @State private var isInsightsOpen = true
    @State private var lastAutosaveTime = ""
    @State private var errorMessage: String? = nil

    private let moods = ["😞", "😐", "🙂", "😄"]

    private var allDailyReviews: [JournalNoteModel] {
        model.journalNotes.filter { $0.deletedAt == nil && ($0.kind == "DAILY_REVIEW" || $0.dailyReview != nil) }
            .sorted { $0.entryDate > $1.entryDate }
    }

    private var currentReviewNote: JournalNoteModel? {
        allDailyReviews.first { $0.entryDate == selectedDate }
    }

    private var morningNote: JournalNoteModel? {
        model.journalNotes.first { $0.deletedAt == nil && $0.entryDate.starts(with: selectedDate) && $0.kind == "NOTE" && $0.dailyReview == nil }
    }

    private var aiInsights: JournalAiInsightsModel? {
        JournalAiInsightsModel(json: currentReviewNote?.dailyReview?.aiInsightsSnapshot)
    }

    private var versionString: String {
        if let note = currentReviewNote {
            return "v\(note.version)"
        }
        return "v1"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            // Signature Panel Frame
            VStack(alignment: .leading, spacing: 0) {
                // Panel Header
                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("DAILY REVIEW · REFLECT ON TODAY")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.mint)

                        Text("Daily review")
                            .font(.system(size: 28, weight: .medium, design: .serif))
                            .foregroundStyle(iTuTheme.ink)

                        // Meta Row
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

                                Text(JournalSupport.slashDate(from: selectedDate))
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(iTuTheme.ink)

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
                            .background(iTuTheme.surfaceMuted)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))

                            Text("#daily-review")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(iTuTheme.mint)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(iTuTheme.mint.opacity(0.12))
                                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

                            Spacer()

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
                                .buttonStyle(iTuSecondaryButtonStyle(height: 28))
                                .disabled(isGeneratingAI || currentReviewNote == nil)

                                Button {
                                    saveDailyReview()
                                } label: {
                                    Text(isSaving ? "Saving…" : "Save Review")
                                }
                                .buttonStyle(iTuPrimaryButtonStyle(height: 28))
                                .disabled(isSaving)
                            }
                        }
                    }

                    Spacer()

                    // Revision Badge
                    DailyStreakRingView(value: versionString, label: "Revision", isRevision: true)
                }
                .padding(20)
                .background(iTuTheme.surface)

                Divider()

                // Main 2-Column Body Layout
                HStack(alignment: .top, spacing: 0) {
                    // Left Column: Write / Reflection Column
                    VStack(alignment: .leading, spacing: 14) {
                        // Mode row & Autosaved status
                        HStack {
                            Picker("Mode", selection: $editorMode) {
                                Text("Edit").tag("EDIT")
                                Text("Source").tag("SOURCE")
                                Text("Preview").tag("PREVIEW")
                            }
                            .pickerStyle(.segmented)
                            .frame(width: 190)

                            Spacer()

                            HStack(spacing: 6) {
                                Circle()
                                    .fill(iTuTheme.mint)
                                    .frame(width: 6, height: 6)
                                    .shadow(color: iTuTheme.mint.opacity(0.6), radius: 2)

                                Text(lastAutosaveTime.isEmpty ? "Autosaved" : "Autosaved · \(lastAutosaveTime)")
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(iTuTheme.inkFaint)
                            }
                        }

                        // Carried from this morning's note
                        VStack(alignment: .leading, spacing: 4) {
                            Text("CARRIED FROM THIS MORNING'S NOTE")
                                .font(.system(size: 9.5, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.mint)

                            if let morningNote, !morningNote.contentMarkdown.isEmpty {
                                Text(morningNote.contentMarkdown)
                                    .font(.system(size: 12))
                                    .foregroundStyle(iTuTheme.ink)
                                    .lineLimit(3)
                            } else {
                                Text("No morning note recorded for today.")
                                    .font(.system(size: 12))
                                    .foregroundStyle(iTuTheme.inkDim)
                                    .italic()
                            }
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(iTuTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))

                        // Four Reflection Questions
                        VStack(alignment: .leading, spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("ENTRY — FOUR QUESTIONS")
                                    .font(.system(size: 9.5, weight: .bold, design: .monospaced))
                                    .foregroundStyle(iTuTheme.inkFaint)
                                Text("How the day actually went")
                                    .font(.system(size: 14, weight: .medium, design: .serif))
                                    .foregroundStyle(iTuTheme.ink)
                            }

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

                        Divider()

                        // Prompt line
                        HStack(spacing: 6) {
                            Text("Prompt —")
                                .font(.system(size: 13, design: .serif))
                                .italic()
                                .foregroundStyle(iTuTheme.inkDim)
                            Text("Where did today diverge from the plan, and was that good or bad?")
                                .font(.system(size: 13, weight: .semibold, design: .serif))
                                .foregroundStyle(iTuTheme.mint)
                        }
                        .padding(.top, 4)
                    }
                    .padding(20)
                    .frame(maxWidth: .infinity, alignment: .topLeading)

                    Divider()

                    // Right Side Column (Inspector / Mood / Attachments / Metadata - NO DOCUMENT STATS)
                    VStack(alignment: .leading, spacing: 18) {
                        // How today felt
                        VStack(alignment: .leading, spacing: 8) {
                            Text("HOW TODAY FELT")
                                .font(.system(size: 9.5, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)

                            HStack(spacing: 6) {
                                ForEach(moods, id: \.self) { emoji in
                                    Button {
                                        selectedMood = emoji
                                    } label: {
                                        Text(emoji)
                                            .font(.system(size: 16))
                                            .frame(maxWidth: .infinity, minHeight: 36)
                                            .background(selectedMood == emoji ? iTuTheme.mint.opacity(0.16) : iTuTheme.surfaceMuted)
                                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                                    .stroke(selectedMood == emoji ? iTuTheme.mint : iTuTheme.border, lineWidth: 1)
                                            )
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }

                        Divider()

                        // Attachments
                        VStack(alignment: .leading, spacing: 6) {
                            Text("ATTACHMENTS (0)")
                                .font(.system(size: 9.5, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)

                            Text("No files attached.")
                                .font(.system(size: 11))
                                .foregroundStyle(iTuTheme.inkFaint)
                                .italic()
                        }

                        Divider()

                        // Metadata
                        VStack(alignment: .leading, spacing: 4) {
                            Text("METADATA")
                                .font(.system(size: 9.5, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)

                            Text("Entry date · \(selectedDate)")
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkDim)

                            Text("Version · \(versionString)")
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkDim)

                            Text("Updated · \(lastAutosaveTime.isEmpty ? "13:14:21" : lastAutosaveTime)")
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkDim)
                        }

                        Divider()

                        // AI Insights block
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                Text("AI INSIGHTS")
                                    .font(.system(size: 9.5, weight: .bold, design: .monospaced))
                                    .foregroundStyle(iTuTheme.inkFaint)

                                Spacer()

                                if aiInsights != nil {
                                    Button {
                                        withAnimation(.easeInOut(duration: 0.15)) {
                                            isInsightsOpen.toggle()
                                        }
                                    } label: {
                                        Image(systemName: isInsightsOpen ? "chevron.up" : "chevron.down")
                                            .font(.system(size: 10))
                                            .foregroundStyle(iTuTheme.mint)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }

                            if isGeneratingAI {
                                HStack(spacing: 6) {
                                    ProgressView().controlSize(.small)
                                    Text("Generating synthesis…")
                                        .font(.system(size: 10.5))
                                        .foregroundStyle(iTuTheme.inkDim)
                                }
                            } else if let insights = aiInsights, isInsightsOpen {
                                VStack(alignment: .leading, spacing: 6) {
                                    Text(insights.headline)
                                        .font(.system(size: 11, weight: .bold))
                                        .foregroundStyle(iTuTheme.ink)
                                    Text(insights.summary)
                                        .font(.system(size: 10))
                                        .foregroundStyle(iTuTheme.inkDim)
                                        .lineLimit(4)
                                }
                            } else if aiInsights == nil {
                                Text("No AI insights yet.")
                                    .font(.system(size: 10.5))
                                    .foregroundStyle(iTuTheme.inkFaint)
                                    .italic()
                            }
                        }

                        Spacer()
                    }
                    .padding(18)
                    .frame(width: 250)
                    .background(iTuTheme.surfaceMuted.opacity(0.5))
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))

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

            // Past Reviews List
            pastReviewsSection
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
                ledgerItem(icon: "checkmark.circle", label: "Tasks", value: "\(tasksDone) done")
                ledgerItem(icon: "clock", label: "Focus", value: "\(focusMinutes)m")
                ledgerItem(icon: "bolt", label: "Habits", value: "\(habitsCompleted)/\(habitsScheduled)")
                ledgerItem(icon: "dumbbell", label: "Training", value: "0 sess.")
                ledgerItem(icon: "creditcard", label: "Spending", value: "₫0")
                ledgerItem(icon: "sparkles", label: "Learning", value: "0 rev.")
                ledgerItem(icon: "flame", label: "Apps", value: "tracked")
                ledgerItem(icon: "globe", label: "Websites", value: "tracked")
            }
        }
        .padding(14)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))
    }

    private func ledgerItem(icon: String, label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 3) {
                Image(systemName: icon)
                    .font(.system(size: 9))
                    .foregroundStyle(iTuTheme.mint)
                Text(label)
                    .font(.system(size: 9.5))
                    .foregroundStyle(iTuTheme.inkDim)
            }
            Text(value)
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.ink)
        }
        .padding(6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(iTuTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private var pastReviewsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PAST REVIEWS (\(allDailyReviews.count))")
                .font(.system(size: 10.5, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.inkDim)

            if allDailyReviews.isEmpty {
                Text("No daily reviews recorded yet.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
            } else {
                LazyVStack(spacing: 6) {
                    ForEach(allDailyReviews) { reviewNote in
                        Button {
                            onSelectNote(reviewNote)
                        } label: {
                            HStack {
                                Text(reviewNote.title.isEmpty ? "Daily review" : reviewNote.title)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(iTuTheme.ink)
                                Spacer()
                                Text(reviewNote.entryDate)
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(iTuTheme.inkDim)
                            }
                            .padding(10)
                            .background(iTuTheme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func questionRow(markColor: Color, prompt: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text("”")
                    .font(.system(size: 15, design: .serif))
                    .italic()
                    .foregroundStyle(markColor)
                Text(prompt)
                    .font(.system(size: 12, design: .serif))
                    .italic()
                    .foregroundStyle(iTuTheme.ink)
            }

            TextEditor(text: text)
                .font(.system(size: 13, design: editorMode == "SOURCE" ? .monospaced : .default))
                .scrollContentBackground(.hidden)
                .frame(minHeight: 52)
                .padding(6)
                .background(iTuTheme.surfaceMuted.opacity(0.6))
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))
                .onChange(of: text.wrappedValue) { _, _ in
                    scheduleAutosave()
                }
        }
    }

    private func changeDateBy(_ days: Int) {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        if let current = formatter.date(from: selectedDate),
           let next = Calendar.current.date(byAdding: .day, value: days, to: current) {
            selectedDate = formatter.string(from: next)
            loadReviewState()
        }
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

    private func scheduleAutosave() {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm:ss"
        lastAutosaveTime = formatter.string(from: Date())
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
        let title = currentReviewNote?.title.isEmpty == false ? currentReviewNote!.title : "Daily Review — \(selectedDate)"
        Task {
            _ = await model.saveDailyReview(
                id: noteID,
                title: title,
                contentMarkdown: md,
                entryDate: selectedDate,
                review: rev
            )
            isSaving = false
            scheduleAutosave()
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
}
