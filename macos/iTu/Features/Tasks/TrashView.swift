import SwiftUI

struct TrashView: View {
    @Environment(AppModel.self) private var model
    @State private var showEmptyConfirm = false
    @State private var deleteTarget: TrashDeleteTarget?

    var body: some View {
        let trashedTasks = model.trashedTasks
        let trashedDecks = model.trashSnapshot?.decks ?? []
        let trashedCards = model.trashSnapshot?.cards ?? []
        let totalCount = trashedTasks.count + trashedDecks.count + trashedCards.count

        return ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 6) {
                        iTuSectionLabel(title: "SYSTEM", color: iTuTheme.coral)
                        Text("Trash")
                            .font(.system(size: 24, weight: .bold, design: .rounded))
                            .foregroundStyle(iTuTheme.ink)
                        Text("Deleted items remain recoverable until permanently removed.")
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    Spacer()
                    HStack(spacing: 10) {
                        Label("\(totalCount) item\(totalCount == 1 ? "" : "s")", systemImage: "trash")
                            .font(.system(size: 12, weight: .semibold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkDim)
                        if !trashedTasks.isEmpty {
                            Button {
                                showEmptyConfirm = true
                            } label: {
                                Label("Empty Tasks", systemImage: "trash")
                            }
                            .buttonStyle(iTuDangerButtonStyle())
                        }
                    }
                }

                if model.trashIsLoading && model.trashSnapshot == nil {
                    ProgressView("Loading Trash…")
                        .frame(maxWidth: .infinity, minHeight: 240)
                        .iTuPanel(radius: 14)
                } else if let errorMessage = model.trashErrorMessage, model.trashSnapshot == nil {
                    VStack(spacing: 10) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.system(size: 30))
                            .foregroundStyle(iTuTheme.coral)
                        Text(errorMessage)
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.inkDim)
                            .multilineTextAlignment(.center)
                        Button("Try Again") {
                            Task { await model.refreshTrash() }
                        }
                        .buttonStyle(iTuSecondaryButtonStyle(height: 32))
                    }
                    .frame(maxWidth: .infinity, minHeight: 240)
                    .iTuPanel(radius: 14)
                } else if totalCount == 0 {
                    VStack(spacing: 12) {
                        Image(systemName: "trash")
                            .font(.system(size: 32))
                            .foregroundStyle(iTuTheme.inkFaint)
                        Text("Trash is empty")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(iTuTheme.inkDim)
                        Text("Deleted decks, cards, and tasks will appear here for recovery.")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.inkFaint)
                    }
                    .frame(maxWidth: .infinity, minHeight: 240)
                    .iTuPanel(radius: 14)
                } else {
                    VStack(alignment: .leading, spacing: 18) {
                        if !trashedTasks.isEmpty {
                            TrashSection(title: "Tasks", count: trashedTasks.count, icon: "checkmark.square") {
                                VStack(spacing: 0) {
                                    ForEach(Array(trashedTasks.enumerated()), id: \.element.id) { index, task in
                                        TrashTaskRow(task: task)
                                        if index < trashedTasks.count - 1 {
                                            Rectangle()
                                                .fill(iTuTheme.borderSoft)
                                                .frame(height: 1)
                                                .padding(.leading, 40)
                                        }
                                    }
                                }
                                .iTuPanel(radius: 14)
                            }
                        }

                        if !trashedDecks.isEmpty {
                            TrashSection(title: "Decks", count: trashedDecks.count, icon: "square.stack.3d.up") {
                                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                                    ForEach(trashedDecks) { deck in
                                        TrashDeckCard(
                                            deck: deck,
                                            onRestore: { Task { await model.restoreTrashDeck(deck) } },
                                            onDelete: { deleteTarget = .deck(deck) }
                                        )
                                    }
                                }
                            }
                        }

                        if !trashedCards.isEmpty {
                            TrashSection(title: "Cards", count: trashedCards.count, icon: "rectangle.stack.badge.xmark") {
                                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                                    ForEach(trashedCards) { card in
                                        TrashCardCard(
                                            card: card,
                                            onRestore: { Task { await model.restoreTrashCard(card) } },
                                            onDelete: { deleteTarget = .card(card) }
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 980)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .background(iTuTheme.canvas)
        .alert("Empty Tasks?", isPresented: $showEmptyConfirm) {
            Button("Delete Permanently", role: .destructive) {
                Task {
                    for task in trashedTasks {
                        await model.permanentlyDeleteTrashTask(task)
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This permanently deletes every trashed task. Decks and cards are not affected.")
        }
        .alert(item: $deleteTarget) { target in
            Alert(
                title: Text("Delete permanently?"),
                message: Text(target.message),
                primaryButton: .destructive(Text("Delete Permanently")) {
                    Task {
                        switch target {
                        case let .deck(deck): await model.permanentlyDeleteTrashDeck(deck)
                        case let .card(card): await model.permanentlyDeleteTrashCard(card)
                        }
                    }
                },
                secondaryButton: .cancel()
            )
        }
        .task {
            await model.refreshTrash()
        }
    }
}

private enum TrashDeleteTarget: Identifiable {
    case deck(DeckModel)
    case card(CardModel)

    var id: String {
        switch self {
        case let .deck(deck): "deck-\(deck.id)"
        case let .card(card): "card-\(card.id)"
        }
    }

    var message: String {
        switch self {
        case let .deck(deck): "This permanently removes \"\(deck.title)\". Its cards move to Recovered Cards."
        case .card: "This card will no longer be recoverable from Trash."
        }
    }
}

private struct TrashSection<Content: View>: View {
    let title: String
    let count: Int
    let icon: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .foregroundStyle(iTuTheme.teal)
                Text(title)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Text("\(count)")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(iTuTheme.canvas)
                    .clipShape(Capsule())
            }
            content()
        }
    }
}

private struct TrashDeckCard: View {
    let deck: DeckModel
    let onRestore: @MainActor @Sendable () -> Void
    let onDelete: @MainActor @Sendable () -> Void
    @State private var isHovered = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: deck.icon)
                    .foregroundStyle(iTuTheme.teal)
                    .frame(width: 30, height: 30)
                    .background(iTuTheme.mintTint)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                Text(deck.title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                    .lineLimit(1)
            }
            Text(deck.description.isEmpty ? "No description" : deck.description)
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.inkDim)
                .lineLimit(2)
            trashActions(onRestore: onRestore, onDelete: onDelete)
        }
        .padding(14)
        .iTuPanel(radius: 12)
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(isHovered ? iTuTheme.teal.opacity(0.5) : iTuTheme.border, lineWidth: 1)
        }
        .onHover { isHovered = $0 }
        .contextMenu {
            Button("Restore Deck", action: onRestore)
            Button("Delete Permanently", role: .destructive, action: onDelete)
        }
    }
}

private struct TrashCardCard: View {
    let card: CardModel
    let onRestore: @MainActor @Sendable () -> Void
    let onDelete: @MainActor @Sendable () -> Void
    @State private var isHovered = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PROMPT")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.inkFaint)
            Text(card.frontMarkdown)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)
                .lineLimit(3)
            Divider()
            Text("ANSWER")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.inkFaint)
            Text(card.backMarkdown)
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.inkDim)
                .lineLimit(3)
            trashActions(onRestore: onRestore, onDelete: onDelete)
        }
        .padding(14)
        .iTuPanel(radius: 12)
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(isHovered ? iTuTheme.teal.opacity(0.5) : iTuTheme.border, lineWidth: 1)
        }
        .onHover { isHovered = $0 }
        .contextMenu {
            Button("Restore Card", action: onRestore)
            Button("Delete Permanently", role: .destructive, action: onDelete)
        }
    }
}

@MainActor @ViewBuilder
private func trashActions(
    onRestore: @MainActor @escaping () -> Void,
    onDelete: @MainActor @escaping () -> Void
) -> some View {
    HStack(spacing: 8) {
        Spacer()
        Button {
            onRestore()
        } label: {
            Label("Restore", systemImage: "arrow.uturn.backward")
        }
        .buttonStyle(iTuSecondaryButtonStyle(height: 28))

        Button {
            onDelete()
        } label: {
            Label("Delete", systemImage: "trash")
        }
        .buttonStyle(iTuDangerButtonStyle())
    }
}

private struct TrashTaskRow: View {
    @Environment(AppModel.self) private var model
    let task: ProductivityTask
    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "trash")
                .font(.system(size: 15))
                .foregroundStyle(iTuTheme.coral)

            VStack(alignment: .leading, spacing: 2) {
                Text(task.title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(iTuTheme.ink)
                if let deletedAt = task.deletedAt {
                    Text("Deleted: \(deletedAt)")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkFaint)
                }
            }

            Spacer()

            Button {
                Task { await model.restoreTrashTask(task) }
            } label: {
                Label("Restore", systemImage: "arrow.uturn.backward")
            }
            .buttonStyle(iTuSecondaryButtonStyle(height: 28))

            Button {
                Task { await model.permanentlyDeleteTrashTask(task) }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(iTuTheme.coral)
                    .frame(width: 28, height: 28)
            }
            .buttonStyle(.plain)
            .pointingHandCursor()
            .help("Delete Permanently")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(isHovered ? iTuTheme.coralTint.opacity(0.3) : Color.clear)
        .onHover { isHovered = $0 }
        .contextMenu {
            Button("Restore Task") {
                Task { await model.restoreTrashTask(task) }
            }
            Button("Delete Permanently", role: .destructive) {
                Task { await model.permanentlyDeleteTrashTask(task) }
            }
        }
    }
}
