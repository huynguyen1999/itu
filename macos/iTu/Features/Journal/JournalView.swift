import SwiftUI

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

    private static var today: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
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
            unsupported("Weekly reviews", detail: "Weekly review entries are not available in the native Journal yet. Continue using Notes here; the web Journal remains available for structured weekly reviews.")
        case .templates:
            unsupported("Templates", detail: "Templates are not available through the native Journal API yet. New notes remain fully supported.")
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
                Text(isSaving ? "Saving…" : "Note")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(iTuTheme.inkDim)
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
                    Text("Freeform note")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                TextField("Add a title if you need one", text: $title)
                    .textFieldStyle(.plain)
                    .font(.system(size: 28, weight: .bold, design: .rounded))
                TextEditor(text: $content)
                    .font(.system(size: 15))
                    .scrollContentBackground(.hidden)
                    .padding(14)
                    .frame(minHeight: 430)
                    .background(iTuTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))
            }
            .padding(22)
            .iTuPanel(radius: 16)
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
            if filteredNotes.isEmpty {
                Text(searchQuery.isEmpty ? "No notes yet." : "No notes match your search.")
                    .font(.system(size: 14)).foregroundStyle(iTuTheme.inkDim)
                    .padding(.vertical, 30)
            } else {
                LazyVStack(spacing: 10) { ForEach(filteredNotes) { note in noteCard(note) } }
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
        guard !query.isEmpty else { return model.journalNotes }
        return model.journalNotes.filter {
            $0.title.localizedCaseInsensitiveContains(query) || $0.contentMarkdown.localizedCaseInsensitiveContains(query) || $0.displayDate.contains(query)
        }
    }

    private func loadNotes() async {
        loadError = await model.loadJournalNotesResult()
    }

    private func newNote() {
        selectedNoteID = nil
        title = ""
        content = ""
        entryDate = Self.today
        saveError = nil
        destination = .daily
    }

    private func open(_ note: JournalNoteModel) {
        selectedNoteID = note.id
        title = note.title
        content = note.contentMarkdown
        entryDate = note.displayDate
        saveError = nil
        destination = .daily
    }

    private func save() {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedContent = content.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty || !trimmedContent.isEmpty else { return }
        isSaving = true
        saveError = nil
        Task {
            let saved = await model.saveJournalNote(
                id: selectedNoteID,
                title: trimmedTitle.isEmpty ? "Untitled note" : trimmedTitle,
                contentMarkdown: content,
                entryDate: entryDate
            )
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
}

private enum JournalDestination: Hashable {
    case overview
    case daily
    case weekly
    case notes
    case templates
}
