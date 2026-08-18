import SwiftUI
import UniformTypeIdentifiers
import iTuDomain
import iTuDesignCore

public typealias Phase6JournalView = JournalView

public struct JournalView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var searchText = ""
    @State private var showingNewNote = false
    @State private var showingDailyReview = false
    @State private var showingWeeklyReview = false
    @State private var showingTags = false
    @State private var showingTemplates = false
    @State private var isLoading = false
    @State private var loadError: String?

    public init() {}

    private var notes: [JournalNoteModel] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        return model.journalNotes
            .filter { $0.deletedAt == nil }
            .filter {
                query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) || $0.contentMarkdown.localizedCaseInsensitiveContains(query)
            }
            .sorted { $0.entryDate > $1.entryDate }
    }

    public var body: some View {
        List {
            if isLoading && model.journalNotes.isEmpty {
                ProgressView("Loading Journal")
                    .frame(maxWidth: .infinity, minHeight: 120)
            } else if let loadError, model.journalNotes.isEmpty {
                VStack(spacing: 12) {
                    Label("Journal unavailable", systemImage: "exclamationmark.triangle")
                        .font(.headline)
                    Text(loadError)
                        .font(.subheadline)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                        .multilineTextAlignment(.center)
                    Button("Retry") { Task { await reload() } }
                        .buttonStyle(.borderedProminent)
                        .tint(IOSColor.teal(colorScheme))
                }
                .frame(maxWidth: .infinity, minHeight: 180)
            } else if notes.isEmpty {
                IOSEmptyState(
                    icon: "book.closed",
                    title: searchText.isEmpty ? "No Journal Entries" : "No matching entries",
                    description: searchText.isEmpty ? "Write your first reflection or note." : "Try a different search."
                )
            } else {
                ForEach(notes) { note in
                    if note.dailyReview != nil || note.weeklyReview != nil || note.kind == "DAILY_REVIEW" || note.kind == "WEEKLY_REVIEW" {
                        NavigationLink { Phase6JournalReviewView(note: note) } label: {
                            Phase6JournalRow(note: note)
                        }
                    } else {
                        NavigationLink { Phase6JournalEditorView(note: note) } label: {
                            Phase6JournalRow(note: note)
                        }
                        .swipeActions {
                            Button("Delete", role: .destructive) { Task { await model.deleteJournalNote(id: note.id) } }
                        }
                    }
                }
            }
        }
        .navigationTitle("Journal")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "Search Journal")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                IOSSyncStatusIndicator()
            }
            ToolbarItemGroup(placement: .topBarTrailing) {
                Menu {
                    Button { showingTags = true } label: { Label("Tags", systemImage: "tag") }
                    Button { showingTemplates = true } label: { Label("Templates", systemImage: "text.badge.plus") }
                    Divider()
                    Button { showingDailyReview = true } label: { Label("Daily review", systemImage: "sun.max") }
                    Button { showingWeeklyReview = true } label: { Label("Weekly review", systemImage: "sparkles") }
                } label: {
                    Label("Journal tools", systemImage: "ellipsis.circle")
                }
                Button { showingNewNote = true } label: {
                    Image(systemName: "square.and.pencil")
                        .foregroundStyle(IOSColor.teal(colorScheme))
                }
            }
        }
        .task { await reload() }
        .sheet(isPresented: $showingNewNote) {
            NavigationStack { Phase6JournalEditorView(note: nil) }
        }
        .sheet(isPresented: $showingDailyReview) {
            NavigationStack { IOSJournalReviewEditorView(kind: .daily) }
        }
        .sheet(isPresented: $showingWeeklyReview) {
            NavigationStack { IOSJournalReviewEditorView(kind: .weekly) }
        }
        .sheet(isPresented: $showingTags) { Phase6JournalTagsView() }
        .sheet(isPresented: $showingTemplates) { Phase6JournalTemplatesView() }
    }

    private func reload() async {
        isLoading = true
        loadError = nil
        let refreshed = await model.refreshJournal()
        if !refreshed { loadError = "The latest entries could not be loaded. Cached entries remain available." }
        isLoading = false
    }
}

private enum IOSJournalReviewKind {
    case daily
    case weekly

    var title: String { self == .daily ? "Daily Review" : "Weekly Review" }
    var systemImage: String { self == .daily ? "sun.max" : "sparkles" }
}

private struct IOSJournalReviewMetric: Identifiable {
    let id: String
    let title: String
    let value: String
}

private struct IOSJournalReviewEditorView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let kind: IOSJournalReviewKind

    @State private var selectedDate = Date()
    @State private var wentWell = ""
    @State private var friction = ""
    @State private var learned = ""
    @State private var context = ""
    @State private var different = ""
    @State private var nextWeek = ""
    @State private var metrics: [String: JSONValue] = [:]
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var isGenerating = false
    @State private var noteID: String?
    @State private var message: String?

    private var dateString: String { IOSProductCalendar.dayString(selectedDate) }
    private var week: (start: String, end: String) {
        iTuCalendarSupport.weekRange(containing: selectedDate, weekStartDay: "MONDAY")
    }
    private var existingNote: JournalNoteModel? {
        if kind == .daily {
            return model.journalNotes.first { $0.deletedAt == nil && $0.dailyReview?.periodDate == dateString }
        }
        return model.journalNotes.first { $0.deletedAt == nil && $0.weeklyReview?.periodStart == week.start }
    }
    private var reviewID: String? { noteID ?? existingNote?.id }

    var body: some View {
        Form {
            Section("Period") {
                DatePicker(
                    kind == .daily ? "Date" : "Week containing",
                    selection: $selectedDate,
                    displayedComponents: .date
                )
                if kind == .weekly {
                    LabeledContent("Range", value: "\(week.start) – \(week.end)")
                }
            }

            if isLoading {
                ProgressView("Loading measured context")
            } else if !metricRows.isEmpty {
                Section("Measured context") {
                    ForEach(metricRows) { metric in
                        LabeledContent(metric.title, value: metric.value)
                    }
                    Text("App, website, and HealthKit measurements are included in the server review context.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Reflection") {
                reviewEditor("What went well", text: $wentWell)
                reviewEditor("Friction or challenges", text: $friction)
                reviewEditor("What I learned", text: $learned)
                if kind == .daily {
                    reviewEditor("Context", text: $context)
                } else {
                    reviewEditor("What felt different", text: $different)
                    reviewEditor("Next week focus", text: $nextWeek)
                }
            }

            if let message {
                Text(message).font(.footnote).foregroundStyle(.secondary)
            }

            Section {
                Button(isSaving ? "Saving…" : "Save \(kind.title)") { save() }
                    .disabled(isSaving)
                if let reviewID {
                    Button(isGenerating ? "Generating…" : "Generate AI insights") { generate(entryID: reviewID) }
                        .disabled(isGenerating || isSaving)
                }
            }

            if let insights = reviewInsights {
                Section("AI insights") {
                    if let headline = insights["headline"]?.stringValue { Text(headline).font(.headline) }
                    if let summary = insights["summary"]?.stringValue { Text(summary) }
                    if let attention = insights["attentionNext"]?.arrayValue {
                        ForEach(attention.compactMap(\.stringValue), id: \.self) { Text("• \($0)") }
                    }
                }
            }
        }
        .navigationTitle(kind.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
        }
        .task { await load() }
        .onChange(of: selectedDate) { _ in Task { await load() } }
    }

    private var metricRows: [IOSJournalReviewMetric] {
        let paths: [(String, String, String)] = [
            ("Tasks completed", "tasks", "completed"),
            ("Focus minutes", "focus", "minutes"),
            ("Habit completion", "habits", "completionRate"),
            ("Gym workouts", "gym", "workouts"),
            ("App activity", "appUsage", "activeSeconds"),
            ("Website activity", "websiteUsage", "activeSeconds"),
            ("Steps", "health", "steps"),
            ("Exercise minutes", "health", "exerciseMinutes"),
            ("HealthKit workout minutes", "health", "workoutMinutes")
        ]
        return paths.compactMap { title, domain, key in
            guard let value = metrics[domain]?.objectValue?[key]?.numberValue else { return nil }
            return IOSJournalReviewMetric(id: "\(domain).\(key)", title: title, value: formatMetric(value, key: key))
        }
    }

    private var reviewInsights: [String: JSONValue]? {
        if kind == .daily { return existingNote?.dailyReview?.aiInsightsSnapshot?.objectValue }
        return existingNote?.weeklyReview?.aiInsightsSnapshot?.objectValue
    }

    @ViewBuilder
    private func reviewEditor(_ title: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.subheadline.weight(.medium))
            TextEditor(text: text).frame(minHeight: 80)
        }
    }

    private func load() async {
        isLoading = true
        message = nil
        let existing = existingNote
        noteID = existing?.id
        if let review = existing?.dailyReview, kind == .daily {
            wentWell = review.wentWellMarkdown ?? ""
            friction = review.frictionMarkdown ?? ""
            learned = review.learnedMarkdown ?? ""
            context = review.contextMarkdown ?? ""
            metrics = review.summarySnapshot
        } else if let review = existing?.weeklyReview, kind == .weekly {
            wentWell = review.wentWellMarkdown ?? ""
            friction = review.frictionMarkdown ?? ""
            learned = review.learnedMarkdown ?? ""
            different = review.differentFromLastWeekMarkdown ?? ""
            nextWeek = review.nextWeekMarkdown ?? ""
            metrics = review.summarySnapshot
        } else {
            let response = kind == .daily
                ? await model.loadJournalDailySummary(date: dateString)
                : await model.loadJournalWeeklySummary(periodStart: week.start, periodEnd: week.end)
            metrics = response?["reviewContext"]?.objectValue?["metrics"]?.objectValue
                ?? response?["metrics"]?.objectValue
                ?? [:]
        }
        isLoading = false
    }

    private func save() {
        isSaving = true
        Task {
            let saved: JournalNoteModel?
            if kind == .daily {
                saved = await model.saveDailyReview(
                    date: dateString, wentWell: wentWell, friction: friction, learned: learned,
                    context: context, summarySnapshot: metrics
                )
            } else {
                saved = await model.saveWeeklyReview(
                    periodStart: week.start, periodEnd: week.end, wentWell: wentWell,
                    friction: friction, learned: learned, different: different,
                    nextWeek: nextWeek, summarySnapshot: metrics
                )
            }
            noteID = saved?.id
            message = saved == nil ? "The review could not be saved." : "Saved locally; sync will continue when connected."
            isSaving = false
        }
    }

    private func generate(entryID: String) {
        isGenerating = true
        Task {
            message = await model.generateReviewInsights(entryID: entryID) ?? "AI insights updated."
            isGenerating = false
        }
    }

    private func formatMetric(_ value: Double, key: String) -> String {
        if key == "activeSeconds" {
            let minutes = Int(value.rounded()) / 60
            return minutes >= 60 ? "\(minutes / 60)h \(minutes % 60)m" : "\(minutes)m"
        }
        if key == "completionRate" { return "\(Int((value * 100).rounded()))%" }
        return String(Int(value.rounded()))
    }
}

private struct Phase6JournalRow: View {
    @EnvironmentObject private var model: AppModel
    let note: JournalNoteModel

    private var isGeneratedReview: Bool {
        note.dailyReview != nil || note.weeklyReview != nil || note.kind == "DAILY_REVIEW" || note.kind == "WEEKLY_REVIEW"
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: isGeneratedReview ? "sparkles" : "note.text")
                .foregroundStyle(isGeneratedReview ? .purple : .accentColor)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(note.title.isEmpty ? "Untitled entry" : note.title).font(.headline)
                    if isGeneratedReview {
                        Text("Read-only").font(.caption2).foregroundStyle(.secondary)
                    }
                    if model.pendingMutations.contains(where: { $0.entityId == note.id }) {
                        Label("Pending sync", systemImage: "clock.arrow.circlepath")
                            .font(.caption2)
                            .foregroundStyle(.orange)
                    }
                }
                Text(note.previewText).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                HStack(spacing: 8) {
                    Text(note.displayDate)
                    if !note.attachments.isEmpty { Label("\(note.attachments.count)", systemImage: "paperclip") }
                    if note.tagIds.isEmpty == false { Label("\(note.tagIds.count)", systemImage: "tag") }
                }
                .font(.caption)
                .foregroundStyle(.tertiary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(note.title.isEmpty ? "Untitled entry" : note.title), \(note.displayDate)")
        .accessibilityValue(
            isGeneratedReview
                ? "Read-only generated review"
                : (model.pendingMutations.contains(where: { $0.entityId == note.id }) ? "Pending sync" : "Journal Entry")
        )
    }
}

struct Phase6JournalEditorView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let note: JournalNoteModel?
    @State private var title: String
    @State private var content: String
    @State private var entryDateValue: Date
    @State private var tagIDs: [String]
    @State private var templateID: String?
    @State private var savedTitle: String
    @State private var savedContent: String
    @State private var savedDate: String
    @State private var savedTagIDs: [String]
    @State private var showingDiscard = false
    @State private var showingImporter = false
    @State private var showingRevisions = false
    @State private var isSaving = false
    @State private var saveError: String?
    @State private var attachmentToDelete: JournalAttachmentModel?

    init(note: JournalNoteModel?) {
        self.note = note
        let title = note?.title ?? ""
        let content = note?.contentMarkdown ?? ""
        let date = note?.displayDate ?? IOSProductCalendar.dayString()
        let tags = note?.tagIds ?? []
        _title = State(initialValue: title)
        _content = State(initialValue: content)
        _entryDateValue = State(initialValue: IOSProductCalendar.date(from: date) ?? Date())
        _tagIDs = State(initialValue: tags)
        _templateID = State(initialValue: note?.templateId)
        _savedTitle = State(initialValue: title)
        _savedContent = State(initialValue: content)
        _savedDate = State(initialValue: date)
        _savedTagIDs = State(initialValue: tags)
    }

    private var isDirty: Bool {
        title != savedTitle || content != savedContent || IOSProductCalendar.dayString(entryDateValue) != savedDate || tagIDs != savedTagIDs
    }

    var body: some View {
        editorForm
            .navigationTitle(note == nil ? "New Journal Entry" : "Edit Journal Entry")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { requestDismiss() } }
                ToolbarItemGroup(placement: .confirmationAction) {
                    if !model.journalTemplates.isEmpty {
                        Menu {
                            ForEach(model.journalTemplates.filter { $0.archivedAt == nil }) { template in
                                Button(template.name) { apply(template) }
                            }
                        } label: { Label("Template", systemImage: "doc.badge.plus") }
                    }
                    Button { save() } label: {
                        if isSaving { ProgressView() } else { Text("Save") }
                    }
                    .disabled(isSaving || (title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
                }
            }
            .interactiveDismissDisabled(isDirty)
            .confirmationDialog("Discard changes?", isPresented: $showingDiscard) {
                Button("Discard Changes", role: .destructive) { dismiss() }
                Button("Keep Editing", role: .cancel) {}
            }
            .confirmationDialog(
                "Remove this attachment?",
                isPresented: Binding(
                    get: { attachmentToDelete != nil },
                    set: { if !$0 { attachmentToDelete = nil } }
                )
            ) {
                if let attachment = attachmentToDelete {
                    Button("Remove Attachment", role: .destructive) {
                        attachmentToDelete = nil
                        guard let note else { return }
                        Task { await model.deleteJournalAttachment(entryID: note.id, attachmentID: attachment.id) }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                if let attachment = attachmentToDelete {
                    Text("\(attachment.fileName) will be removed from this Journal Entry and queued for sync.")
                }
            }
            .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
                guard case let .success(urls) = result, let note else { return }
                for url in urls {
                    guard url.startAccessingSecurityScopedResource(), let data = try? Data(contentsOf: url) else { continue }
                    defer { url.stopAccessingSecurityScopedResource() }
                    Task {
                        await model.queueJournalAttachment(
                            id: ULID.generate(), data: data, entryId: note.id,
                            fileName: url.lastPathComponent,
                            mimeType: UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                        )
                    }
                }
            }
            .sheet(isPresented: $showingRevisions) {
                if let note { Phase6JournalRevisionsView(entryID: note.id) }
            }
    }

    @ViewBuilder
    private var editorForm: some View {
        Form {
            if let saveError {
                Text(saveError).font(.footnote).foregroundStyle(.red)
            }
            Section("Entry") {
                TextField("Title", text: $title)
                DatePicker("Entry date", selection: $entryDateValue, displayedComponents: .date)
                TextEditor(text: $content).frame(minHeight: 220)
            }
            Section("Tags") {
                if model.journalTags.isEmpty {
                    Text("No tags yet. Add one from Journal tools.").foregroundStyle(.secondary)
                } else {
                    ForEach(model.journalTags) { tag in
                        Toggle(isOn: Binding(
                            get: { tagIDs.contains(tag.id) },
                            set: { selected in
                                if selected { tagIDs.append(tag.id) } else { tagIDs.removeAll { $0 == tag.id } }
                            }
                        )) {
                            Label(tag.name, systemImage: "tag.fill")
                        }
                    }
                }
            }
            if let note {
                Section("Attachments") {
                    if note.attachments.isEmpty && pendingAttachments.isEmpty {
                        Text("No attachments").foregroundStyle(.secondary)
                    }
                    ForEach(note.attachments) { attachment in
                        HStack {
                            Label(attachment.fileName, systemImage: "paperclip")
                            Spacer()
                            Button("Remove", role: .destructive) {
                                attachmentToDelete = attachment
                            }
                            .font(.caption)
                        }
                    }
                    ForEach(pendingAttachments, id: \.id) { item in
                        Label("\(item.fileName) · Pending locally", systemImage: "clock.arrow.circlepath")
                            .foregroundStyle(.orange)
                    }
                    Button("Add attachment") { showingImporter = true }
                    Text("Files stay local while offline and upload automatically when iTu reconnects.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Revisions") {
                    Button("View revision history") { showingRevisions = true }
                }
            }
        }
    }

    private var pendingAttachments: [JournalPendingAttachmentRow] {
        guard let note else { return [] }
        return model.pendingJournalAttachmentMetadata.compactMap { id, metadata in
            metadata.entryId == note.id ? JournalPendingAttachmentRow(id: id, fileName: metadata.fileName) : nil
        }
    }

    private func apply(_ template: JournalTemplateModel) {
        title = template.titleTemplate
        content = template.bodyMarkdown
        templateID = template.id
    }

    private func save() {
        isSaving = true
        saveError = nil
        Task {
            let date = IOSProductCalendar.dayString(entryDateValue)
            let saved = await model.saveJournalEntry(id: note?.id, title: title, contentMarkdown: content, entryDate: date, tagIds: tagIDs, templateId: templateID)
            if saved {
                savedTitle = title
                savedContent = content
                savedDate = date
                savedTagIDs = tagIDs
                dismiss()
            } else {
                saveError = "Enter a valid date and try again. Your draft is still here."
            }
            isSaving = false
        }
    }

    private func requestDismiss() {
        if isDirty { showingDiscard = true } else { dismiss() }
    }
}

private struct JournalPendingAttachmentRow: Identifiable {
    let id: String
    let fileName: String
}

private struct Phase6JournalReviewView: View {
    let note: JournalNoteModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Label(note.dailyReview != nil ? "Daily Review" : "Weekly Review", systemImage: "sparkles")
                    .font(.headline)
                    .foregroundStyle(.purple)
                Text(note.title.isEmpty ? "Untitled review" : note.title).font(.title2.bold())
                Text(note.contentMarkdown).frame(maxWidth: .infinity, alignment: .leading)
                if let daily = note.dailyReview {
                    reviewFields(daily.summarySnapshot)
                }
                if let weekly = note.weeklyReview {
                    Text("\(weekly.periodStart) – \(weekly.periodEnd)").font(.subheadline).foregroundStyle(.secondary)
                    reviewFields(weekly.summarySnapshot)
                }
                Text("Generated reviews are read-only. Create a Journal Entry if you want to add a personal reflection.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
        .navigationTitle("Review")
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func reviewFields(_ values: [String: JSONValue]) -> some View {
        ForEach(values.keys.sorted(), id: \.self) { key in
            if let value = values[key]?.stringValue, !value.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(key.replacingOccurrences(of: "_", with: " ").capitalized).font(.caption.bold())
                    Text(value)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }
}

private struct Phase6JournalRevisionsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let entryID: String
    @State private var isLoading = true
    @State private var loadError: String?
    @State private var revisionToRestore: JournalEntryRevisionModel?
    @State private var isRestoring = false

    var body: some View {
        NavigationStack {
            List {
                let revisions = model.journalRevisionsByEntryID[entryID] ?? []
                if isLoading {
                    ProgressView("Loading revisions")
                        .frame(maxWidth: .infinity, minHeight: 100)
                } else if let loadError {
                    VStack(spacing: 12) {
                        Label("Revision history unavailable", systemImage: "exclamationmark.triangle")
                            .font(.headline)
                        Text(loadError)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                        Button("Retry") { Task { await reload() } }
                            .buttonStyle(.borderedProminent)
                    }
                    .frame(maxWidth: .infinity, minHeight: 160)
                } else if revisions.isEmpty {
                    IOSContentUnavailableView("No revisions", systemImage: "clock.arrow.circlepath")
                } else {
                    ForEach(revisions.reversed()) { revision in
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Revision \(revision.revisionNumber)").font(.headline)
                            Text(revision.createdAt).font(.caption).foregroundStyle(.secondary)
                            if let title = revision.snapshot["title"]?.stringValue { Text(title).lineLimit(1) }
                            Button("Restore this revision") { revisionToRestore = revision }
                                .buttonStyle(.bordered)
                                .disabled(isRestoring)
                        }
                    }
                }
            }
            .navigationTitle("Revisions")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
            .task { await reload() }
            .confirmationDialog(
                "Restore this revision?",
                isPresented: Binding(
                    get: { revisionToRestore != nil },
                    set: { if !$0 { revisionToRestore = nil } }
                )
            ) {
                if let revision = revisionToRestore {
                    Button("Restore Revision", role: .destructive) {
                        revisionToRestore = nil
                        Task { await restore(revision) }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                if let revision = revisionToRestore {
                    Text("Revision \(revision.revisionNumber) will replace the current Journal Entry content.")
                }
            }
        }
    }

    private func reload() async {
        isLoading = true
        loadError = nil
        let loaded = await model.loadJournalRevisions(entryID: entryID)
        if !loaded { loadError = "The revision history could not be loaded." }
        isLoading = false
    }

    private func restore(_ revision: JournalEntryRevisionModel) async {
        isRestoring = true
        let restored = await model.restoreJournalRevision(entryID: entryID, revisionID: revision.id)
        if restored {
            dismiss()
        } else {
            loadError = "The revision could not be restored. Try again."
        }
        isRestoring = false
    }
}

private struct Phase6JournalTagsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""

    var body: some View {
        NavigationStack {
            List {
                ForEach(model.journalTags) { tag in
                    Label(tag.name, systemImage: "tag.fill")
                }
                Section("New Tag") {
                    TextField("Tag name", text: $name)
                    Button("Add Tag") {
                        let value = name
                        name = ""
                        Task { await model.createJournalTag(name: value) }
                    }
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .navigationTitle("Journal Tags")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }
    }
}

private struct Phase6JournalTemplatesView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var titleTemplate = ""
    @State private var bodyMarkdown = ""
    @State private var templateToDelete: JournalTemplateModel?

    var body: some View {
        NavigationStack {
            templatesForm
                .navigationTitle("Journal Templates")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
                .confirmationDialog(
                    "Delete this Journal Template?",
                    isPresented: Binding(
                        get: { templateToDelete != nil },
                        set: { if !$0 { templateToDelete = nil } }
                    )
                ) {
                    if let template = templateToDelete {
                        Button("Delete Template", role: .destructive) {
                            templateToDelete = nil
                            Task { await model.deleteJournalTemplate(id: template.id) }
                        }
                    }
                    Button("Cancel", role: .cancel) {}
                } message: {
                    if let template = templateToDelete {
                        Text("\(template.name) will be removed from this device and queued for sync.")
                    }
                }
        }
    }

    @ViewBuilder
    private var templatesForm: some View {
        Form {
                Section("Templates") {
                    ForEach(model.journalTemplates.filter { $0.archivedAt == nil }) { template in
                        HStack {
                            VStack(alignment: .leading) { Text(template.name); Text(template.bodyMarkdown).font(.caption).foregroundStyle(.secondary).lineLimit(1) }
                            Spacer()
                            Button("Delete", role: .destructive) { templateToDelete = template }
                                .font(.caption)
                        }
                    }
                }
                Section("New Template") {
                    TextField("Name", text: $name)
                    TextField("Title", text: $titleTemplate)
                    TextEditor(text: $bodyMarkdown).frame(minHeight: 90)
                    Button("Add Template") { addTemplate() }
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }

    private func addTemplate() {
        guard let accountID = model.user?.id else { return }
        let now = ISO8601DateFormatter().string(from: Date())
        let template = JournalTemplateModel(
            id: ULID.generate(), userId: accountID, name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            entryKind: "NOTE", titleTemplate: titleTemplate, bodyMarkdown: bodyMarkdown,
            defaults: [:], builtIn: false, archivedAt: nil, version: 1, createdAt: now, updatedAt: now
        )
        name = ""
        titleTemplate = ""
        bodyMarkdown = ""
        Task { await model.saveJournalTemplate(template) }
    }
}
