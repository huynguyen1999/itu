import SwiftUI

struct NoteEditorView: View {
    @Environment(AppModel.self) private var model
    @Binding var note: JournalNoteModel
    @Binding var editorMode: String
    @Binding var showInspector: Bool
    var onDelete: () -> Void
    var onSaved: () -> Void

    @State private var titleDraft: String = ""
    @State private var contentDraft: String = ""
    @State private var isSaving: Bool = false
    @State private var deleteConfirm: Bool = false
    @State private var lastSavedTime: String = ""

    private var isDaily: Bool {
        note.kind == "NOTE"
    }

    private var streakCount: Int {
        let allDates = model.journalNotes.filter { $0.deletedAt == nil }.map { $0.entryDate }
        return JournalSupport.calculateStreak(dates: allDates, targetDate: note.entryDate)
    }

    private var promptText: String {
        let prompts = [
            "What's one thing you avoided today, and why?",
            "What would make today feel truly accomplished?",
            "What is top of mind as you begin this session?",
            "What is one small win or breakthrough from yesterday?",
            "What friction point are you ready to clear away?",
            "What does deep focus look like for the next 2 hours?",
            "What are you most excited to learn or create today?",
        ]
        let idx = (note.entryDate.hashValue & 0x7FFFFFFF) % prompts.count
        return prompts[idx]
    }

    var body: some View {
        // Signature Panel
        VStack(alignment: .leading, spacing: 0) {
            // Panel Header
                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("DAILY WRITING · \(JournalSupport.dayOfWeek(from: note.entryDate).uppercased())")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.mint)

                        TextField("Daily note", text: $titleDraft)
                            .font(.system(size: 28, weight: .medium, design: .serif))
                            .textFieldStyle(.plain)
                            .foregroundStyle(iTuTheme.ink)
                            .onChange(of: titleDraft) { _, newValue in
                                note.title = newValue
                                scheduleSave()
                            }

                        // Meta Row
                        HStack(spacing: 8) {
                            HStack(spacing: 5) {
                                Image(systemName: "calendar")
                                    .font(.system(size: 10))
                                    .foregroundStyle(iTuTheme.mint)
                                Text(JournalSupport.slashDate(from: note.entryDate))
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(iTuTheme.ink)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(iTuTheme.surfaceMuted)
                            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))

                            ForEach(note.tags) { tag in
                                Text("#\(tag.name)")
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundStyle(iTuTheme.mint)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(iTuTheme.mint.opacity(0.12))
                                    .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                            }
                        }
                    }

                    Spacer()

                    // Streak concentric rings
                    DailyStreakRingView(value: "\(streakCount)", label: "Day streak")
                }
                .padding(20)
                .background(iTuTheme.surface)

                Divider()

                // Editor Content & Controls
                VStack(alignment: .leading, spacing: 14) {
                    // Mode Row & Saved status
                    HStack(spacing: 12) {
                        Picker("Mode", selection: $editorMode) {
                            Text("Write").tag("LIVE")
                            Text("Preview").tag("PREVIEW")
                            Text("Source").tag("SOURCE")
                        }
                        .pickerStyle(.segmented)
                        .frame(width: 200)

                        Spacer()

                        HStack(spacing: 6) {
                            Circle()
                                .fill(iTuTheme.mint)
                                .frame(width: 6, height: 6)
                                .shadow(color: iTuTheme.mint.opacity(0.6), radius: 2)

                            Text(lastSavedTime.isEmpty ? "Saved locally" : "Saved locally · \(lastSavedTime)")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)
                        }

                        // Inspector toggle
                        Button {
                            showInspector.toggle()
                        } label: {
                            Image(systemName: "sidebar.right")
                                .foregroundStyle(showInspector ? iTuTheme.teal : iTuTheme.inkDim)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .help("Toggle Inspector")

                        // Delete button
                        Button {
                            deleteConfirm = true
                        } label: {
                            Image(systemName: "trash")
                                .foregroundStyle(iTuTheme.coral)
                        }
                        .buttonStyle(.borderless)
                        .help("Move to Trash")
                    }

                    // Text Editor Canvas with Left Accent Line
                    HStack(spacing: 0) {
                        Rectangle()
                            .fill(iTuTheme.mint.opacity(0.5))
                            .frame(width: 2)
                            .padding(.vertical, 4)

                        if editorMode == "PREVIEW" {
                            ScrollView {
                                Text(contentDraft.isEmpty ? "*What's on your mind today? Markdown and [[links]] both work.*" : contentDraft)
                                    .font(.system(size: 16, design: .serif))
                                    .lineSpacing(6)
                                    .foregroundStyle(iTuTheme.ink)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.leading, 14)
                                    .padding(.vertical, 8)
                            }
                            .frame(minHeight: 280)
                        } else {
                            TextEditor(text: $contentDraft)
                                .font(.system(size: 15, design: editorMode == "SOURCE" ? .monospaced : .serif))
                                .lineSpacing(5)
                                .scrollContentBackground(.hidden)
                                .padding(.leading, 10)
                                .frame(minHeight: 280)
                                .onChange(of: contentDraft) { _, newValue in
                                    note.contentMarkdown = newValue
                                    scheduleSave()
                                }
                        }
                    }

                    Divider()

                    // Prompt Line
                    HStack(spacing: 6) {
                        Text("Prompt —")
                            .font(.system(size: 13, design: .serif))
                            .italic()
                            .foregroundStyle(iTuTheme.inkDim)
                        Text(promptText)
                            .font(.system(size: 13, weight: .semibold, design: .serif))
                            .foregroundStyle(iTuTheme.mint)
                    }
                    .padding(.top, 4)
                }
                .padding(20)
                .background(iTuTheme.surface)
            }
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(iTuTheme.border, lineWidth: 1))
        .onAppear {
            titleDraft = note.title
            contentDraft = note.contentMarkdown
            updateLastSavedTime()
        }
        .onChange(of: note.id) { _, _ in
            titleDraft = note.title
            contentDraft = note.contentMarkdown
            updateLastSavedTime()
        }
        .alert("Delete note?", isPresented: $deleteConfirm) {
            Button("Move to Trash", role: .destructive) {
                onDelete()
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("You can restore this note from Trash.")
        }
    }

    private func updateLastSavedTime() {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        lastSavedTime = formatter.string(from: Date())
    }

    private func scheduleSave() {
        Task {
            _ = await model.saveJournalNote(
                id: note.id,
                title: note.title,
                contentMarkdown: note.contentMarkdown,
                entryDate: note.entryDate,
                tagIds: note.tagIds
            )
            updateLastSavedTime()
            onSaved()
        }
    }
}
