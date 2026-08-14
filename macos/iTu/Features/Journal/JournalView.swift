import SwiftUI
import UniformTypeIdentifiers

struct JournalView: View {
    @Environment(AppModel.self) private var model
    @SceneStorage("journal.destination") private var destinationRaw = JournalDestination.overview.rawValue
    @State private var selectedNoteID: String?
    @State private var searchQuery = ""
    @State private var selectedTagID = ""
    @State private var editorMode = "LIVE"
    @State private var showInspector = true
    @State private var showingSettings = false
    @State private var showFileImporter = false

    // Template state
    @State private var editingTemplateID: String?
    @State private var templateNameDraft = ""
    @State private var templateTitleDraft = ""
    @State private var templateBodyDraft = ""

    private var destination: JournalDestination {
        JournalDestination(rawValue: destinationRaw) ?? .overview
    }

    private var currentNoteBinding: Binding<JournalNoteModel>? {
        guard let noteID = selectedNoteID,
              let idx = model.journalNotes.firstIndex(where: { $0.id == noteID && $0.deletedAt == nil }) else { return nil }
        return Binding(
            get: { model.journalNotes[idx] },
            set: { _ in }
        )
    }

    private var allNotes: [JournalNoteModel] {
        model.journalNotes.filter { $0.deletedAt == nil }
    }

    private var filteredNotes: [JournalNoteModel] {
        allNotes.filter { note in
            (searchQuery.isEmpty || note.title.localizedCaseInsensitiveContains(searchQuery) || note.contentMarkdown.localizedCaseInsensitiveContains(searchQuery)) &&
            (selectedTagID.isEmpty || note.tagIds.contains(selectedTagID)) &&
            (note.kind != "DAILY_REVIEW" && note.kind != "WEEKLY_REVIEW" && note.dailyReview == nil && note.weeklyReview == nil)
        }
    }

    var body: some View {
        HStack(spacing: 0) {
            // Sidebar
            JournalSidebarView(
                destination: Binding(
                    get: { destination },
                    set: { destinationRaw = $0.rawValue; selectedNoteID = nil }
                ),
                searchQuery: $searchQuery,
                selectedTagID: $selectedTagID,
                onNewNoteClicked: { createNewNote() }
            )

            // Main Content Area
            VStack(alignment: .leading, spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        if let binding = currentNoteBinding {
                            HStack(alignment: .top, spacing: 0) {
                                NoteEditorView(
                                    note: binding,
                                    editorMode: $editorMode,
                                    showInspector: $showInspector,
                                    onDelete: {
                                        let noteID = binding.wrappedValue.id
                                        selectedNoteID = nil
                                        Task {
                                            await model.deleteJournalNote(id: noteID)
                                        }
                                    },
                                    onSaved: {}
                                )
                                .frame(maxWidth: .infinity, alignment: .topLeading)

                                if showInspector {
                                    NoteInspectorView(
                                        note: binding.wrappedValue,
                                        onAddAttachmentClicked: { showFileImporter = true },
                                        onClose: { showInspector = false }
                                    )
                                }
                            }
                        } else {
                            destinationContent
                        }
                    }
                    .padding(24)
                }
                .iTuPinnedHeader { pageHeader }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .background(iTuTheme.canvas)
        .task {
            await model.refreshCoordinator.run(.journal) {
                await model.loadJournalNotes()
            }
        }
        .fileImporter(isPresented: $showFileImporter, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            guard let entryID = selectedNoteID, case let .success(urls) = result else { return }
            for url in urls {
                guard url.startAccessingSecurityScopedResource() else { continue }
                defer { url.stopAccessingSecurityScopedResource() }
                guard let data = try? Data(contentsOf: url) else { continue }
                Task {
                    await model.queueJournalAttachment(
                        id: ULID.generate(),
                        data: data,
                        entryId: entryID,
                        fileName: url.lastPathComponent,
                        mimeType: UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
                    )
                }
            }
        }
    }

    @ViewBuilder
    private var destinationContent: some View {
        switch destination {
        case .overview:
            JournalOverviewView(
                onSelectNote: { selectedNoteID = $0.id },
                onNewDailyNote: { createDailyNote() },
                onNewDailyReview: { destinationRaw = JournalDestination.dailyReviews.rawValue },
                onNewWeeklyReview: { destinationRaw = JournalDestination.weeklyReviews.rawValue }
            )
        case .dailyReviews:
            DailyReviewsView(
                onSelectNote: { selectedNoteID = $0.id }
            )
        case .weeklyReviews:
            WeeklyReviewsView(onSelectNote: { selectedNoteID = $0.id })
        case .templates:
            templatesView
        default:
            notesListView
        }
    }

    private var notesListView: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(destination == .dailyNotes ? "Daily Notes" : "All Notes")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)

                Spacer()

                Text("\(filteredNotes.count) notes")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            if filteredNotes.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "doc.text")
                        .font(.system(size: 28))
                        .foregroundStyle(iTuTheme.inkDim)
                    Text("No notes match your filter.")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)
                }
                .frame(maxWidth: .infinity, minHeight: 120)
                .background(iTuTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 280, maximum: 400), spacing: 12)], spacing: 12) {
                    ForEach(filteredNotes) { note in
                        Button {
                            selectedNoteID = note.id
                        } label: {
                            noteCard(note)
                        }
                        .buttonStyle(.plain)
                        .contextMenu {
                            Button {
                                selectedNoteID = note.id
                            } label: {
                                Label("Open Note", systemImage: "doc.text")
                            }
                            Divider()
                            Button(role: .destructive) {
                                Task {
                                    await model.deleteJournalNote(id: note.id)
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

    private var templatesView: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Templates")
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundStyle(iTuTheme.ink)

            let templates = model.journalTemplates.filter { $0.archivedAt == nil }
            if templates.isEmpty {
                Text("No custom templates available.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
            } else {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 260, maximum: 380), spacing: 12)], spacing: 12) {
                    ForEach(templates) { t in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(t.name)
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(iTuTheme.ink)
                            Text(t.bodyMarkdown)
                                .font(.system(size: 11))
                                .foregroundStyle(iTuTheme.inkDim)
                                .lineLimit(2)
                            Button("Use Template") {
                                applyTemplate(t)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
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
            }
        }
    }

    private var pageHeader: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                if selectedNoteID != nil {
                    HStack(spacing: 8) {
                        Button {
                            selectedNoteID = nil
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "chevron.left")
                                Text("Back")
                            }
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(iTuTheme.teal)
                        }
                        .buttonStyle(.plain)

                        Text("· Editor")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                } else {
                    Text(destination.title)
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                    Text("Capture thoughts, log reviews, and track daily reflections.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                }
            }

            Spacer()

            Button("Journal preferences", systemImage: "gearshape") {
                showingSettings.toggle()
            }
            .labelStyle(.iconOnly)
            .buttonStyle(.plain)
            .help("Journal preferences")
            .popover(isPresented: $showingSettings, arrowEdge: .top) {
                JournalSettingsPopover()
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .background(iTuTheme.canvas)
    }

    private func createNewNote() {
        Task {
            if let note = await model.saveJournalNote(
                id: nil,
                title: "Untitled Note",
                contentMarkdown: "",
                entryDate: iTuCalendarSupport.dayString()
            ) {
                selectedNoteID = note.id
            }
        }
    }

    private func createDailyNote(for dateStr: String? = nil) {
        let date = dateStr ?? iTuCalendarSupport.dayString()
        Task {
            if let note = await model.saveJournalNote(
                id: nil,
                title: "Daily note",
                contentMarkdown: "",
                entryDate: date
            ) {
                selectedNoteID = note.id
            }
        }
    }

    private func applyTemplate(_ t: JournalTemplateModel) {
        Task {
            if let note = await model.saveJournalNote(
                id: nil,
                title: t.titleTemplate.isEmpty ? t.name : t.titleTemplate,
                contentMarkdown: t.bodyMarkdown,
                entryDate: iTuCalendarSupport.dayString()
            ) {
                selectedNoteID = note.id
            }
        }
    }
}
