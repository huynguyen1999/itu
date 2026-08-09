import SwiftUI
import UniformTypeIdentifiers

struct JournalView: View {
    @Environment(AppModel.self) private var model
    @State private var destination: JournalDestination = .overview
    @State private var selectedNoteID: String?
    @State private var title = ""
    @State private var content = ""
    @State private var entryDate = Self.today
    @State private var searchQuery = ""
    @State private var isSaving = false
    @State private var loadError: String?
    @State private var saveError: String?
    @State private var isWeeklyReview = false
    @State private var editorMode = "LIVE"
    @State private var selectedTagIDs: Set<String> = []
    @State private var filterKind = "ALL"
    @State private var filterTagID = ""
    @State private var filterDate = ""
    @State private var newTagName = ""
    @State private var reviewPeriodStart = Self.today
    @State private var reviewPeriodEnd = Self.today
    @State private var reviewWentWell = ""
    @State private var reviewFriction = ""
    @State private var reviewNextWeek = ""
    @State private var reviewSummary: [String: JSONValue] = [:]
    @State private var weeklySummaryMessage: String?
    @State private var showFileImporter = false
    @State private var editingTemplateID: String?
    @State private var templateNameDraft = ""
    @State private var templateTitleDraft = ""
    @State private var templateBodyDraft = ""

    private static var today: String {
        iTuCalendarSupport.dayString()
    }

    var body: some View {
        HStack(spacing: 0) {
            sidebar
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if let loadError {
                        errorBanner(loadError, action: { Task { await loadNotes() } })
                    }
                    if let saveError {
                        errorBanner(saveError, action: { save() })
                    }
                    if let message = model.errorMessage {
                        errorBanner(message, action: { model.errorMessage = nil })
                    }
                    contentView
                }
                .frame(maxWidth: 980, alignment: .leading)
                .padding(.horizontal, 34)
                .padding(.vertical, 28)
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .background(iTuTheme.canvas)
        }
        .background(iTuTheme.canvas)
        .task { await loadNotes() }
        .fileImporter(isPresented: $showFileImporter, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            guard let entryID = selectedNoteID else { return }
            guard case let .success(urls) = result else { return }
            for url in urls {
                guard url.startAccessingSecurityScopedResource() else { continue }
                defer { url.stopAccessingSecurityScopedResource() }
                guard let data = try? Data(contentsOf: url) else { continue }
                Task {
                    await model.queueJournalAttachment(id: ULID.generate(), data: data, entryId: entryID, fileName: url.lastPathComponent, mimeType: UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream")
                }
            }
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text("WORKSPACE")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.4)
                    .foregroundStyle(iTuTheme.mint)
                Text("Journal")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 22)

            Divider().overlay(iTuTheme.border)

            VStack(spacing: 4) {
                navigationButton("Overview", icon: "compass", destination: .overview)
                navigationButton("Daily Notes", icon: "calendar", destination: .daily)
                navigationButton("Weekly Reviews", icon: "calendar.badge.clock", destination: .weekly)
                navigationButton("All Notes", icon: "doc.text", destination: .notes)
                navigationButton("Templates", icon: "doc.on.doc", destination: .templates)
                navigationButton("Trash", icon: "trash", destination: .trash)
            }
            .padding(12)

            Divider().overlay(iTuTheme.border)

            VStack(alignment: .leading, spacing: 8) {
                Text("RECENT NOTES")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.2)
                    .foregroundStyle(iTuTheme.inkDim)
                ForEach(model.journalNotes.prefix(8)) { note in
                    Button { open(note) } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(note.title.isEmpty ? "Untitled note" : note.title).lineLimit(1)
                            Text(note.displayDate)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(iTuTheme.ink)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(selectedNoteID == note.id ? iTuTheme.mintTint : .clear)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
            }
            .padding(12)

            Spacer()
        }
        .frame(width: 250)
        .background(iTuTheme.surfaceMuted)
        .overlay(alignment: .trailing) { Divider().overlay(iTuTheme.border) }
    }

    private func navigationButton(_ title: String, icon: String, destination: JournalDestination) -> some View {
        Button {
            self.destination = destination
            if destination == .daily, let todayNote {
                open(todayNote)
            }
        } label: {
            Label(title, systemImage: icon)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
        .font(.system(size: 14, weight: self.destination == destination ? .semibold : .regular))
        .foregroundStyle(self.destination == destination ? iTuTheme.teal : iTuTheme.inkDim)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(self.destination == destination ? iTuTheme.mintTint : .clear)
        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
    }

    @ViewBuilder
    private var contentView: some View {
        switch destination {
        case .overview:
            overview
        case .daily:
            editor
        case .notes:
            notesLibrary
        case .weekly:
            weeklyReviews
        case .templates:
            templatesView
        case .trash:
            trashView
        }
    }

    private var overview: some View {
        VStack(alignment: .leading, spacing: 24) {
            HStack(alignment: .top, spacing: 20) {
                VStack(alignment: .leading, spacing: 7) {
                    Label("DAILY WRITING", systemImage: "book.closed")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(1.4)
                        .foregroundStyle(iTuTheme.mint)
                    Text("Make a little room.")
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                    Text("A quiet place for the day as it is. Write freely first; organize it when you are ready.")
                        .font(.system(size: 14))
                        .foregroundStyle(iTuTheme.inkDim)
                        .frame(maxWidth: 520, alignment: .leading)
                }
                Spacer()
                HStack(spacing: 8) {
                    Button { destination = .notes } label: { Label("Search", systemImage: "magnifyingglass") }
                        .buttonStyle(iTuSecondaryButtonStyle(height: 34))
                    Button { newNote() } label: { Label("New note", systemImage: "plus") }
                        .buttonStyle(iTuPrimaryButtonStyle(height: 34))
                }
            }

            HStack(alignment: .top, spacing: 16) {
                VStack(alignment: .leading, spacing: 16) {
                    Text(Self.today)
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.mint)
                    Text(todayNote?.title.isEmpty == false ? todayNote!.title : "What is on your mind?")
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                    Text(todayNote?.previewText ?? "Start with one honest sentence. There is no format to get right.")
                        .font(.system(size: 14))
                        .foregroundStyle(Color.white.opacity(0.72))
                        .lineLimit(3)
                    Button { todayNote.map(open) ?? newNote() } label: {
                        Label(todayNote == nil ? "Start today’s note" : "Continue writing", systemImage: "sparkles")
                    }
                    .buttonStyle(iTuSecondaryButtonStyle(height: 38))
                }
                .padding(24)
                .frame(maxWidth: .infinity, minHeight: 210, alignment: .leading)
                .foregroundStyle(Color.white)
                .modifier(iTuGradientCardModifier(radius: 16))

                VStack(alignment: .leading, spacing: 10) {
                    Text("KEEP THE THREAD")
                        .font(.system(size: 10, weight: .bold))
                        .tracking(1.2)
                        .foregroundStyle(iTuTheme.inkDim)
                    Text("Notes can stay rough. Start with the thought, then return when you have more shape.")
                        .font(.system(size: 13))
                        .foregroundStyle(iTuTheme.ink)
                    Button { destination = .weekly } label: {
                        HStack { Text("Weekly review"); Spacer(); Image(systemName: "arrow.right") }
                    }
                    .buttonStyle(iTuGhostButtonStyle())
                }
                .padding(18)
                .frame(width: 230, alignment: .leading)
                .iTuPanel(radius: 14)
            }

            sectionHeader("RECENT WRITING", actionTitle: "Browse all notes") { destination = .notes }
            if recentNotes.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "doc.text").font(.title2).foregroundStyle(iTuTheme.teal)
                    Text("Nothing written here yet.").font(.system(size: 14, weight: .semibold))
                    Text("Start today’s note, or open a blank note when a thought arrives.")
                        .font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim)
                    Button("Write a note") { newNote() }.buttonStyle(iTuPrimaryButtonStyle(height: 34))
                }
                .frame(maxWidth: .infinity)
                .padding(32)
                .iTuPanel(radius: 14)
            } else {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(recentNotes) { note in noteCard(note) }
                }
            }
        }
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Button { destination = .overview } label: { Label("Journal overview", systemImage: "chevron.left") }
                    .buttonStyle(iTuGhostButtonStyle())
                Spacer()
                Text(isSaving ? "Saving…" : (isWeeklyReview ? "Weekly review" : "Note"))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(iTuTheme.inkDim)
                    if selectedNoteID != nil {
                        Button { Task { await model.deleteJournalNote(id: selectedNoteID!); destination = .trash } } label: { Label("Delete", systemImage: "trash") }
                            .buttonStyle(iTuGhostButtonStyle())
                    }
                    Button { save() } label: { Label("Save", systemImage: "checkmark") }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 34))
                    .disabled(isSaving || (title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty))
            }
            .padding(.bottom, 4)

            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Label(entryDate, systemImage: "calendar")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                    Spacer()
                    Picker("Mode", selection: $editorMode) {
                        Text("Edit").tag("LIVE")
                        Text("Markdown").tag("SOURCE")
                        Text("Preview").tag("PREVIEW")
                    }
                    .pickerStyle(.menu)
                    Text(isWeeklyReview ? "Weekly review" : "Freeform note")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                TextField("Add a title if you need one", text: $title)
                    .textFieldStyle(.plain)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                if editorMode == "PREVIEW" {
                    Group {
                        if let markdown = try? AttributedString(markdown: content), !content.isEmpty {
                            Text(markdown)
                        } else {
                            Text("Nothing to preview yet.")
                        }
                    }
                        .font(.system(size: 15)).frame(maxWidth: .infinity, minHeight: 430, alignment: .topLeading)
                        .padding(14).background(iTuTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                } else {
                    TextEditor(text: $content)
                        .font(.system(size: 15)).scrollContentBackground(.hidden).padding(14).frame(minHeight: 430)
                        .background(iTuTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))
                }
                tagPicker
                if isWeeklyReview { weeklyReviewFields }
                if selectedNoteID != nil { attachmentsAndRevisions }
            }
            .padding(22)
            .iTuPanel(radius: 16)
        }
    }

    private var tagPicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TAGS").font(.system(size: 10, weight: .bold)).tracking(1.2).foregroundStyle(iTuTheme.inkDim)
            if model.journalTags.isEmpty {
                Text("Create a tag in All Notes to classify this entry.").font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim)
            } else {
                HStack(spacing: 6) {
                    ForEach(model.journalTags) { tag in
                        Button {
                            if selectedTagIDs.contains(tag.id) { selectedTagIDs.remove(tag.id) } else { selectedTagIDs.insert(tag.id) }
                        } label: {
                            Text(tag.name).font(.system(size: 11, weight: .medium)).padding(.horizontal, 9).padding(.vertical, 5)
                                .background(selectedTagIDs.contains(tag.id) ? iTuTheme.mintTint : iTuTheme.surface)
                                .clipShape(Capsule())
                        }.buttonStyle(.plain).foregroundStyle(iTuTheme.ink)
                    }
                }
            }
        }
    }

    private var weeklyReviewFields: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("WEEKLY REVIEW · \(reviewPeriodStart) – \(reviewPeriodEnd)").font(.system(size: 10, weight: .bold)).tracking(1.1).foregroundStyle(iTuTheme.inkDim)
            HStack {
                Button("Load weekly summary") { Task { await loadWeeklySummary() } }.buttonStyle(iTuGhostButtonStyle())
                if let weeklySummaryMessage { Text(weeklySummaryMessage).font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim) }
            }
            if !reviewSummary.isEmpty {
                Text(reviewSummary.keys.sorted().map { "\($0): \(reviewSummary[$0]!.stringValue ?? String(describing: reviewSummary[$0]!))" }.joined(separator: " · "))
                    .font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim).lineLimit(3)
            }
            TextField("What went well?", text: $reviewWentWell, axis: .vertical).textFieldStyle(.roundedBorder).lineLimit(2...5)
            TextField("Where was there friction?", text: $reviewFriction, axis: .vertical).textFieldStyle(.roundedBorder).lineLimit(2...5)
            TextField("What is next week’s focus?", text: $reviewNextWeek, axis: .vertical).textFieldStyle(.roundedBorder).lineLimit(2...5)
        }
    }

    private var attachmentsAndRevisions: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("ATTACHMENTS").font(.system(size: 10, weight: .bold)).tracking(1.1).foregroundStyle(iTuTheme.inkDim)
                Spacer()
                Button("Add files") { showFileImporter = true }.buttonStyle(iTuGhostButtonStyle())
            }
            if let note = selectedNoteID.flatMap({ id in model.currentSnapshot.journalNotes.first(where: { $0.id == id }) }) {
                ForEach(note.attachments) { attachment in
                    HStack {
                        Image(systemName: "paperclip"); Text(attachment.fileName).lineLimit(1); Spacer()
                        Button("Delete") { Task { await model.deleteJournalAttachment(entryID: note.id, attachmentID: attachment.id) } }.buttonStyle(iTuGhostButtonStyle())
                    }.font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim)
                }
                let pending = model.currentSnapshot.pendingJournalAttachmentMetadata.filter { $0.value.entryId == note.id }
                ForEach(Array(pending), id: \.key) { item in
                    HStack { Image(systemName: "arrow.triangle.2.circlepath"); Text("Uploading \(item.value.fileName)"); Spacer(); Button("Retry") { Task { await model.retryJournalAttachment(id: item.key) } }.buttonStyle(iTuGhostButtonStyle()) }
                        .font(.system(size: 12)).foregroundStyle(iTuTheme.amber)
                }
            }
            HStack {
                Text("REVISIONS").font(.system(size: 10, weight: .bold)).tracking(1.1).foregroundStyle(iTuTheme.inkDim)
                Button("Load") { if let id = selectedNoteID { Task { await model.loadJournalRevisions(entryID: id) } } }.buttonStyle(iTuGhostButtonStyle())
            }
            if let id = selectedNoteID {
                ForEach(model.journalRevisionsByEntryID[id] ?? []) { revision in
                    HStack { Text("Revision \(revision.revisionNumber)"); Spacer(); Button("Preview") { content = revision.snapshot["contentMarkdown"]?.stringValue ?? content }.buttonStyle(iTuGhostButtonStyle()); Button("Restore") { Task { await model.restoreJournalRevision(entryID: id, revisionID: revision.id); await loadNotes() } }.buttonStyle(iTuGhostButtonStyle()) }
                        .font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim)
                }
            }
        }
    }

    private var notesLibrary: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("ALL NOTES").font(.system(size: 10, weight: .bold)).tracking(1.3).foregroundStyle(iTuTheme.mint)
                    Text("Your pages").font(.system(size: 28, weight: .bold, design: .rounded))
                }
                Spacer()
                Button { newNote() } label: { Label("New note", systemImage: "plus") }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 34))
            }
            TextField("Search journal…", text: $searchQuery)
                .textFieldStyle(.roundedBorder)
                .frame(maxWidth: 420)
            HStack(spacing: 8) {
                Picker("Kind", selection: $filterKind) {
                    Text("All kinds").tag("ALL")
                    Text("Notes").tag("NOTE")
                    Text("Weekly reviews").tag("WEEKLY_REVIEW")
                }.pickerStyle(.menu)
                Picker("Tag", selection: $filterTagID) {
                    Text("All tags").tag("")
                    ForEach(model.journalTags) { tag in Text(tag.name).tag(tag.id) }
                }.pickerStyle(.menu)
                TextField("Date YYYY-MM-DD", text: $filterDate).textFieldStyle(.roundedBorder).frame(width: 150)
            }
            HStack(spacing: 8) {
                Text("Tags").font(.system(size: 12, weight: .semibold)).foregroundStyle(iTuTheme.inkDim)
                ForEach(model.journalTags.prefix(8)) { tag in
                    Text(tag.name).font(.system(size: 11)).padding(.horizontal, 8).padding(.vertical, 4).background(iTuTheme.mintTint).clipShape(Capsule())
                }
                TextField("New tag name", text: $newTagName).textFieldStyle(.roundedBorder).frame(width: 150)
                Button("Create tag") {
                    let name = newTagName.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !name.isEmpty else { return }
                    Task { await model.createJournalTag(name: name); newTagName = "" }
                }.buttonStyle(iTuGhostButtonStyle())
            }
            if filteredNotes.isEmpty {
                Text(searchQuery.isEmpty ? "No notes yet." : "No notes match your search.")
                    .font(.system(size: 14)).foregroundStyle(iTuTheme.inkDim)
                    .padding(.vertical, 30)
            } else {
                LazyVStack(spacing: 10) { ForEach(filteredNotes) { note in noteCard(note) } }
            }
        }
    }

    private var weeklyReviews: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionHeader("WEEKLY REVIEWS", actionTitle: "New review") { newReview() }
            let reviews = model.journalNotes.filter { $0.kind == "WEEKLY_REVIEW" }
            if reviews.isEmpty { Text("No weekly reviews yet.").foregroundStyle(iTuTheme.inkDim) }
            else { LazyVStack(spacing: 10) { ForEach(reviews) { note in noteCard(note) } } }
        }
    }

    private var templatesView: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("TEMPLATES").font(.system(size: 10, weight: .bold)).tracking(1.3).foregroundStyle(iTuTheme.mint)
            Text("Reusable starting points").font(.system(size: 28, weight: .bold, design: .rounded))
            Button("Create template") { Task { await model.createJournalTemplate(name: "New template") } }
                .buttonStyle(iTuSecondaryButtonStyle(height: 30))
            if model.journalTemplates.isEmpty { Text("No templates yet.").foregroundStyle(iTuTheme.inkDim) }
            else {
                ForEach(model.journalTemplates) { template in
                    HStack {
                        Button { newNote(); title = template.titleTemplate; content = template.bodyMarkdown } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(template.name).font(.system(size: 15, weight: .semibold))
                                Text(template.entryKind).font(.system(size: 11, design: .monospaced)).foregroundStyle(iTuTheme.inkDim)
                            }.frame(maxWidth: .infinity, alignment: .leading).padding(14)
                        }.buttonStyle(.plain)
                        Button("Edit") {
                            editingTemplateID = template.id
                            templateNameDraft = template.name
                            templateTitleDraft = template.titleTemplate
                            templateBodyDraft = template.bodyMarkdown
                        }.buttonStyle(iTuGhostButtonStyle())
                        Button("Delete") { Task { await model.deleteJournalTemplate(id: template.id) } }.buttonStyle(iTuGhostButtonStyle())
                    }.iTuPanel(radius: 10)
                    if editingTemplateID == template.id {
                        VStack(alignment: .leading, spacing: 8) {
                            TextField("Template name", text: $templateNameDraft).textFieldStyle(.roundedBorder)
                            TextField("Title template", text: $templateTitleDraft).textFieldStyle(.roundedBorder)
                            TextEditor(text: $templateBodyDraft).frame(minHeight: 90).scrollContentBackground(.hidden).padding(6).background(iTuTheme.surface).clipShape(RoundedRectangle(cornerRadius: 8))
                            HStack {
                                Button("Save template") {
                                    Task { await model.updateJournalTemplate(id: template.id, name: templateNameDraft, titleTemplate: templateTitleDraft, bodyMarkdown: templateBodyDraft); editingTemplateID = nil }
                                }.buttonStyle(iTuPrimaryButtonStyle(height: 30))
                                Button("Cancel") { editingTemplateID = nil }.buttonStyle(iTuGhostButtonStyle())
                            }
                        }.padding(12).iTuPanel(radius: 10)
                    }
                }
            }
        }
    }

    private var trashView: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("TRASH").font(.system(size: 10, weight: .bold)).tracking(1.3).foregroundStyle(iTuTheme.mint)
            let deleted = model.currentSnapshot.journalNotes.filter { $0.deletedAt != nil }
            if deleted.isEmpty { Text("Trash is empty.").foregroundStyle(iTuTheme.inkDim) }
            ForEach(deleted) { note in
                HStack {
                    Text(note.title.isEmpty ? "Untitled note" : note.title); Spacer()
                    Button("Restore") { Task { await model.restoreJournalNote(id: note.id) } }.buttonStyle(iTuSecondaryButtonStyle(height: 28))
                }.padding(12).iTuPanel(radius: 10)
            }
        }
    }

    private func unsupported(_ title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title.uppercased()).font(.system(size: 10, weight: .bold)).tracking(1.3).foregroundStyle(iTuTheme.mint)
            Text("Not available on macOS yet").font(.system(size: 27, weight: .bold, design: .rounded))
            Text(detail).font(.system(size: 14)).foregroundStyle(iTuTheme.inkDim).frame(maxWidth: 560, alignment: .leading)
            Button("Back to overview") { destination = .overview }.buttonStyle(iTuPrimaryButtonStyle(height: 34))
        }
        .padding(26)
        .iTuPanel(radius: 16)
    }

    private func sectionHeader(_ title: String, actionTitle: String, action: @escaping () -> Void) -> some View {
        HStack {
            Text(title).font(.system(size: 10, weight: .bold)).tracking(1.3).foregroundStyle(iTuTheme.inkDim)
            Spacer()
            Button(actionTitle, action: action).buttonStyle(iTuGhostButtonStyle())
        }
    }

    private func noteCard(_ note: JournalNoteModel) -> some View {
        Button { open(note) } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(note.displayDate).font(.system(size: 10, design: .monospaced)).foregroundStyle(iTuTheme.teal)
                    Spacer()
                    Image(systemName: "arrow.up.right").font(.caption).foregroundStyle(iTuTheme.inkFaint)
                }
                Text(note.title.isEmpty ? "Untitled note" : note.title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                Text(note.previewText).font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim).lineLimit(3)
            }
            .frame(maxWidth: .infinity, minHeight: 112, alignment: .topLeading)
            .padding(16)
        }
        .buttonStyle(.plain)
        .iTuPanel(radius: 12)
        .modifier(iTuHoverCardModifier())
    }

    private func errorBanner(_ message: String, action: @escaping () -> Void) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle").foregroundStyle(iTuTheme.coral)
            VStack(alignment: .leading, spacing: 3) {
                Text("Journal could not be saved or loaded.").font(.system(size: 13, weight: .semibold))
                Text(message).font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim)
            }
            Spacer()
            Button("Try again", action: action).buttonStyle(iTuSecondaryButtonStyle(height: 30))
        }
        .padding(12)
        .background(iTuTheme.coralTint)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private var todayNote: JournalNoteModel? {
        model.journalNotes.first { $0.kind == "NOTE" && $0.displayDate == Self.today }
    }

    private var recentNotes: [JournalNoteModel] { Array(model.journalNotes.prefix(6)) }

    private var filteredNotes: [JournalNoteModel] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        return model.journalNotes.filter {
            (query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) || $0.contentMarkdown.localizedCaseInsensitiveContains(query) || $0.displayDate.contains(query)) &&
            (filterKind == "ALL" || $0.kind == filterKind) &&
            (filterTagID.isEmpty || $0.tagIds.contains(filterTagID)) &&
            (filterDate.isEmpty || $0.displayDate == filterDate)
        }
    }

    private func loadNotes() async {
        loadError = await model.loadJournalNotesResult()
    }

    private func newNote() {
        selectedNoteID = nil
        isWeeklyReview = false
        editorMode = Self.nativeEditorMode(model.settingsStore.journalDefaultEditorMode)
        title = ""
        content = ""
        entryDate = iTuCalendarSupport.dayString()
        selectedTagIDs = []
        reviewPeriodStart = entryDate
        reviewPeriodEnd = entryDate
        reviewWentWell = ""
        reviewFriction = ""
        reviewNextWeek = ""
        reviewSummary = [:]
        weeklySummaryMessage = nil
        saveError = nil
        destination = .daily
    }

    private func open(_ note: JournalNoteModel) {
        selectedNoteID = note.id
        isWeeklyReview = note.kind == "WEEKLY_REVIEW"
        editorMode = Self.nativeEditorMode(model.settingsStore.journalDefaultEditorMode)
        title = note.title
        content = note.contentMarkdown
        entryDate = note.displayDate
        selectedTagIDs = Set(note.tagIds)
        let review = note.weeklyReview
        reviewPeriodStart = String((review?.periodStart ?? note.displayDate).prefix(10))
        reviewPeriodEnd = String((review?.periodEnd ?? note.displayDate).prefix(10))
        reviewWentWell = review?.wentWellMarkdown ?? ""
        reviewFriction = review?.frictionMarkdown ?? ""
        reviewNextWeek = review?.nextWeekMarkdown ?? ""
        reviewSummary = review?.summarySnapshot ?? [:]
        weeklySummaryMessage = nil
        saveError = nil
        destination = .daily
    }

    private func newReview() {
        newNote()
        isWeeklyReview = true
        title = "Weekly review"
        let range = iTuCalendarSupport.weekRange(weekStartDay: model.settingsStore.journalWeekStartDay)
        reviewPeriodStart = range.start
        reviewPeriodEnd = range.end
        entryDate = range.start
    }

    private func save() {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedContent = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty || !trimmedContent.isEmpty else { return }
        isSaving = true
        saveError = nil
        Task {
            let saved: JournalNoteModel?
            if isWeeklyReview {
                let review = JournalWeeklyReviewModel(entryId: selectedNoteID ?? "", periodStart: reviewPeriodStart, periodEnd: reviewPeriodEnd, summarySnapshot: reviewSummary, wentWellMarkdown: reviewWentWell.isEmpty ? nil : reviewWentWell, frictionMarkdown: reviewFriction.isEmpty ? nil : reviewFriction, nextWeekMarkdown: reviewNextWeek.isEmpty ? nil : reviewNextWeek, experimentSnapshot: nil)
                let combined = [reviewWentWell, reviewFriction, reviewNextWeek].filter { !$0.isEmpty }.joined(separator: "\n\n")
                saved = await model.saveWeeklyReview(id: selectedNoteID, title: trimmedTitle.isEmpty ? "Weekly review" : trimmedTitle, contentMarkdown: combined.isEmpty ? content : combined, entryDate: reviewPeriodStart, review: review, tagIds: Array(selectedTagIDs))
            } else {
                saved = await model.saveJournalNote(id: selectedNoteID, title: trimmedTitle.isEmpty ? "Untitled note" : trimmedTitle, contentMarkdown: content, entryDate: entryDate, tagIds: Array(selectedTagIDs))
            }
            if let saved {
                selectedNoteID = saved.id
                title = saved.title
                loadError = nil
            } else {
                saveError = model.errorMessage ?? "The note could not be saved."
            }
            isSaving = false
        }
    }

    private func loadWeeklySummary() async {
        weeklySummaryMessage = "Loading summary…"
        if let summary = await model.loadJournalWeeklySummary(periodStart: reviewPeriodStart, periodEnd: reviewPeriodEnd) {
            reviewSummary = summary
            weeklySummaryMessage = "Summary refreshed online."
        } else {
            weeklySummaryMessage = "Summary unavailable offline; manual fields remain editable."
        }
    }

    private static func nativeEditorMode(_ value: String) -> String {
        switch value.uppercased() {
        case "SOURCE", "EDIT": return "SOURCE"
        case "PREVIEW": return "PREVIEW"
        default: return "LIVE"
        }
    }
}

private enum JournalDestination: Hashable {
    case overview
    case daily
    case weekly
    case notes
    case templates
    case trash
}
