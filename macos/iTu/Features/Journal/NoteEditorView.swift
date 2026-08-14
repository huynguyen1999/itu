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

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Editor Toolbar
            HStack(spacing: 10) {
                // Formatting Controls
                Group {
                    formatButton(icon: "bold", tag: "bold") { insertMarkdown("**", suffix: "**") }
                    formatButton(icon: "italic", tag: "italic") { insertMarkdown("*", suffix: "*") }
                    formatButton(icon: "textformat.size.larger", tag: "h1") { insertMarkdown("# ", prefixAtLine: true) }
                    formatButton(icon: "textformat.size", tag: "h2") { insertMarkdown("## ", prefixAtLine: true) }
                    formatButton(icon: "list.bullet", tag: "list") { insertMarkdown("- ", prefixAtLine: true) }
                    formatButton(icon: "text.quote", tag: "quote") { insertMarkdown("> ", prefixAtLine: true) }
                    formatButton(icon: "curlybraces", tag: "code") { insertMarkdown("`", suffix: "`") }
                }

                Spacer()

                // Editor Mode Picker
                Picker("Mode", selection: $editorMode) {
                    Text("Edit").tag("LIVE")
                    Text("Source").tag("SOURCE")
                    Text("Preview").tag("PREVIEW")
                }
                .pickerStyle(.segmented)
                .frame(width: 190)

                // Inspector Toggle
                Button {
                    showInspector.toggle()
                } label: {
                    Image(systemName: showInspector ? "sidebar.right" : "sidebar.right")
                        .foregroundStyle(showInspector ? iTuTheme.teal : iTuTheme.inkDim)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .help("Toggle Note Inspector")

                // Delete Button
                Button {
                    deleteConfirm = true
                } label: {
                    Image(systemName: "trash")
                        .foregroundStyle(iTuTheme.coral)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Delete note")
            }
            .padding(.bottom, 6)

            Divider()

            // Title & Date Header
            VStack(alignment: .leading, spacing: 6) {
                TextField("Note Title", text: $titleDraft)
                    .font(.system(size: 24, weight: .bold, design: .rounded))
                    .textFieldStyle(.plain)
                    .onChange(of: titleDraft) { _, newValue in
                        note.title = newValue
                        scheduleSave()
                    }

                HStack(spacing: 10) {
                    Label(note.displayDate, systemImage: "calendar")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)

                    if note.kind != "NOTE" {
                        Text(note.kind.replacingOccurrences(of: "_", with: " "))
                            .font(.system(size: 9, weight: .bold))
                            .foregroundStyle(iTuTheme.teal)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(iTuTheme.teal.opacity(0.12))
                            .clipShape(Capsule())
                    }
                }
            }

            // Content Area based on Mode
            if editorMode == "PREVIEW" {
                ScrollView {
                    Text(contentDraft.isEmpty ? "*No content*" : contentDraft)
                        .font(.system(size: 14))
                        .foregroundStyle(iTuTheme.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(iTuTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(iTuTheme.border, lineWidth: 1)
                }
            } else {
                TextEditor(text: $contentDraft)
                    .font(.system(size: 14, design: editorMode == "SOURCE" ? .monospaced : .default))
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .background(iTuTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(iTuTheme.border, lineWidth: 1)
                    }
                    .onChange(of: contentDraft) { _, newValue in
                        note.contentMarkdown = newValue
                        scheduleSave()
                    }
            }
        }
        .onAppear {
            titleDraft = note.title
            contentDraft = note.contentMarkdown
        }
        .onChange(of: note.id) { _, _ in
            titleDraft = note.title
            contentDraft = note.contentMarkdown
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

    private func formatButton(icon: String, tag: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 12))
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }

    private func insertMarkdown(_ prefix: String, suffix: String = "", prefixAtLine: Bool = false) {
        if prefixAtLine {
            contentDraft = prefix + contentDraft
        } else {
            contentDraft += prefix + "text" + suffix
        }
        note.contentMarkdown = contentDraft
        scheduleSave()
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
            onSaved()
        }
    }
}

