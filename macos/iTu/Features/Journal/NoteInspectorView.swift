import SwiftUI
import AppKit

struct NoteInspectorView: View {
    @Environment(AppModel.self) private var model
    let note: JournalNoteModel
    var onAddAttachmentClicked: () -> Void
    var onClose: () -> Void

    @State private var newTagName = ""
    @State private var isCreatingTag = false

    private var words: Int {
        JournalSupport.wordCount(for: note.contentMarkdown)
    }

    private var chars: Int {
        JournalSupport.characterCount(for: note.contentMarkdown)
    }

    private var readMinutes: Int {
        JournalSupport.readingTimeMinutes(for: note.contentMarkdown)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            // Header
            HStack {
                Label("Note Inspector", systemImage: "sidebar.right")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)

                Spacer()

                Button {
                    onClose()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                .buttonStyle(.plain)
            }

            Divider()

            // Text Metrics
            VStack(alignment: .leading, spacing: 8) {
                Text("DOCUMENT STATS")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                HStack(spacing: 8) {
                    metricBadge(label: "WORDS", value: "\(words)")
                    metricBadge(label: "CHARS", value: "\(chars)")
                    metricBadge(label: "READ TIME", value: "\(readMinutes)m")
                }
            }

            Divider()

            // Tags Section
            VStack(alignment: .leading, spacing: 8) {
                Text("TAGS")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                if note.tags.isEmpty {
                    Text("No tags attached.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    FlowLayout(spacing: 6) {
                        ForEach(note.tags) { tag in
                            HStack(spacing: 4) {
                                Text(tag.name)
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundStyle(iTuTheme.teal)

                                Button {
                                    removeTag(tag.id)
                                } label: {
                                    Image(systemName: "xmark")
                                        .font(.system(size: 8))
                                        .foregroundStyle(iTuTheme.teal.opacity(0.8))
                                }
                                .buttonStyle(.plain)
                            }
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(iTuTheme.teal.opacity(0.12))
                            .clipShape(Capsule())
                        }
                    }
                }

                // Add Tag Field
                HStack(spacing: 6) {
                    TextField("Add tag…", text: $newTagName)
                        .textFieldStyle(.roundedBorder)
                        .controlSize(.small)
                        .onSubmit {
                            addTag()
                        }

                    Button("+") {
                        addTag()
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(newTagName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }

            Divider()

            // Attachments Section
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("ATTACHMENTS (\(note.attachments.count))")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)

                    Spacer()

                    Button {
                        onAddAttachmentClicked()
                    } label: {
                        Label("Add", systemImage: "plus")
                            .font(.system(size: 10, weight: .semibold))
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.mini)
                }

                if note.attachments.isEmpty {
                    Text("No files attached.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    VStack(spacing: 6) {
                        ForEach(note.attachments) { att in
                            attachmentRow(att)
                        }
                    }
                }
            }

            Divider()

            // Revision & Timestamps
            VStack(alignment: .leading, spacing: 4) {
                Text("METADATA")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                Text("Entry date: \(note.displayDate)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                Text("Version: v\(note.version)")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                Text("Updated: \(String(note.updatedAt.prefix(19)))")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            Spacer()
        }
        .padding(16)
        .frame(width: 260)
        .background(iTuTheme.surface)
        .overlay(alignment: .leading) {
            Rectangle().fill(iTuTheme.border).frame(width: 1)
        }
    }

    private func metricBadge(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 8, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.inkDim)
            Text(value)
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.ink)
        }
        .padding(6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(iTuTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private func attachmentRow(_ att: JournalAttachmentModel) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "paperclip")
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkDim)

            VStack(alignment: .leading, spacing: 1) {
                Text(att.fileName)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(iTuTheme.ink)
                    .lineLimit(1)
                Text("\(att.sizeBytes / 1024) KB")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            Spacer()

            if let url = att.url, let fileURL = URL(string: url) {
                Button {
                    NSWorkspace.shared.open(fileURL)
                } label: {
                    Image(systemName: "arrow.up.right.square")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.teal)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(8)
        .background(iTuTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }

    private func addTag() {
        let trimmed = newTagName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        Task {
            _ = await model.createJournalTag(name: trimmed, color: "#10b981")
            if let tag = model.journalTags.first(where: { $0.name.localizedCaseInsensitiveCompare(trimmed) == .orderedSame }) {
                var updatedTags = note.tagIds
                if !updatedTags.contains(tag.id) {
                    updatedTags.append(tag.id)
                    _ = await model.saveJournalNote(
                        id: note.id,
                        title: note.title,
                        contentMarkdown: note.contentMarkdown,
                        entryDate: note.entryDate,
                        tagIds: updatedTags
                    )
                }
            }
            newTagName = ""
        }
    }

    private func removeTag(_ tagID: String) {
        let updatedTags = note.tagIds.filter { $0 != tagID }
        Task {
            _ = await model.saveJournalNote(
                id: note.id,
                title: note.title,
                contentMarkdown: note.contentMarkdown,
                entryDate: note.entryDate,
                tagIds: updatedTags
            )
        }
    }
}


private struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 200
        var height: CGFloat = 0
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > width && currentX > 0 {
                currentX = 0
                currentY += rowHeight + spacing
                rowHeight = 0
            }
            rowHeight = max(rowHeight, size.height)
            currentX += size.width + spacing
        }
        height = currentY + rowHeight
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var currentX = bounds.minX
        var currentY = bounds.minY
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > bounds.maxX && currentX > bounds.minX {
                currentX = bounds.minX
                currentY += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: currentX, y: currentY), proposal: .unspecified)
            rowHeight = max(rowHeight, size.height)
            currentX += size.width + spacing
        }
    }
}
