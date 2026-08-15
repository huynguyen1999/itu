import SwiftUI

struct LearnView: View {
    @Environment(AppModel.self) private var model

    @State private var activeReviewDeck: DeckModel?
    @State private var activeDeckDetail: DeckModel?
    @State private var showHistory = false
    @State private var showCreateDeckSheet = false
    @State private var searchText = ""

    private var decks: [DeckModel] {
        model.decks
    }

    private var filteredDecks: [DeckModel] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return decks }
        return decks.filter {
            $0.title.localizedCaseInsensitiveContains(query) ||
            $0.description.localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        HStack(spacing: 0) {
            learnSidebar
            Rectangle()
                .fill(iTuTheme.border)
                .frame(width: 1)

            Group {
                if let deck = activeReviewDeck {
                    ReviewSessionView(deck: deck) {
                        activeReviewDeck = nil
                    }
                } else if let deck = activeDeckDetail {
                    DeckDetailView(
                        deck: deck,
                        onBack: { activeDeckDetail = nil },
                        onStartReview: { activeReviewDeck = deck }
                    )
                } else if showHistory {
                    StudyHistoryView(onBack: { showHistory = false })
                } else {
                    deckLibraryView
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var learnSidebar: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 3) {
                iTuSectionLabel(title: "LIBRARY", color: iTuTheme.teal)
                Text("Learn")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
            }
            .padding(.horizontal, 12)
            .padding(.top, 16)
            .padding(.bottom, 8)

            LearnNavigationButton(
                title: "Decks & cards",
                systemImage: "books.vertical",
                isSelected: activeReviewDeck == nil && activeDeckDetail == nil && !showHistory
            ) {
                activeReviewDeck = nil
                activeDeckDetail = nil
                showHistory = false
            }

            LearnNavigationButton(
                title: "Review",
                systemImage: "play.circle",
                isSelected: activeReviewDeck != nil
            ) {
                activeDeckDetail = nil
                showHistory = false
                activeReviewDeck = decks.first(where: { $0.dueCount > 0 }) ?? decks.first
            }

            LearnNavigationButton(
                title: "Learning history",
                systemImage: "clock.arrow.circlepath",
                isSelected: showHistory
            ) {
                activeReviewDeck = nil
                activeDeckDetail = nil
                showHistory = true
            }

            Spacer()
        }
        .padding(12)
        .frame(width: 216)
        .frame(maxHeight: .infinity, alignment: .topLeading)
        .background(iTuTheme.surface)
    }

    private var deckLibraryView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                // Decks Grid
                if filteredDecks.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "book.closed")
                            .font(.system(size: 36))
                            .foregroundStyle(iTuTheme.inkDim)
                        Text(decks.isEmpty ? "No Decks Available" : "No Matching Decks")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                        Text(decks.isEmpty ? "Create your first deck to start learning with flashcards." : "Try a different title or description.")
                            .font(.system(size: 13))
                            .foregroundStyle(iTuTheme.inkDim)
                        if !decks.isEmpty && !searchText.isEmpty {
                            Button("Clear Search") { searchText = "" }
                                .buttonStyle(iTuSecondaryButtonStyle(height: 32))
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 40)
                    .iTuPanel(radius: 14)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 260), spacing: 16)], spacing: 16) {
                        ForEach(filteredDecks) { deck in
                            DeckCardView(
                                deck: deck,
                                onStartReview: { activeReviewDeck = deck },
                                onOpenDeck: { activeDeckDetail = deck },
                                onArchive: { Task { await model.archiveDeck(deck) } }
                            )
                        }
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 1100)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .iTuPinnedHeader {
            iTuPageHeader(
                kicker: "KNOWLEDGE & LEARNING",
                title: "Flashcards & Decks",
                description: "Master new skills with spaced repetition flashcard review.",
                actions: {
                    Button { showHistory = true } label: { Label("History", systemImage: "clock.arrow.circlepath") }
                        .buttonStyle(iTuHeaderGhostButtonStyle(height: 38))
                    Button { showCreateDeckSheet = true } label: { Label("New Deck", systemImage: "plus") }
                        .buttonStyle(iTuPrimaryButtonStyle(height: 38))
                },
                controls: { deckSearch }
            )
        }
        .background(
            LinearGradient(
                colors: [iTuTheme.canvas, iTuTheme.mintTint.opacity(0.2)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .sheet(isPresented: $showCreateDeckSheet) {
            CreateDeckSheet { title, description in
                Task { await model.createDeck(title: title, description: description) }
            }
        }
    }

    private var deckSearch: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(iTuTheme.inkDim)
            TextField("Search your decks", text: $searchText)
                .textFieldStyle(.plain)
            if !searchText.isEmpty {
                Button { searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(iTuTheme.inkDim)
                }
                .buttonStyle(.plain)
                .pointingHandCursor()
                .accessibilityLabel("Clear deck search")
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 38)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(iTuTheme.border, lineWidth: 1) }
    }
}

private struct LearnNavigationButton: View {
    let title: String
    let systemImage: String
    let isSelected: Bool
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .frame(width: 18)
                Text(title)
                    .font(.system(size: 13, weight: isSelected ? .semibold : .regular))
                Spacer()
            }
            .foregroundStyle(isSelected ? iTuTheme.teal : iTuTheme.inkDim)
            .padding(.horizontal, 10)
            .frame(height: 36)
            .background(isSelected ? iTuTheme.mintTint : (isHovered ? iTuTheme.surfaceMuted : Color.clear))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
        .onHover { isHovered = $0 }
    }
}

private struct DeckCardView: View {
    let deck: DeckModel
    let onStartReview: () -> Void
    let onOpenDeck: () -> Void
    let onArchive: () -> Void

    @State private var isHovered = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                DeckIconView(icon: deck.icon, size: 20, color: iTuTheme.teal)
                    .frame(width: 42, height: 42)
                    .background(iTuTheme.mintTint)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(deck.title)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)

                    Text("\(deck.cardCount) Cards")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                }

                Spacer()
            }

            Text(deck.description)
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.inkDim)
                .lineLimit(2)

            HStack {
                if deck.dueCount > 0 {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(iTuTheme.coral)
                            .frame(width: 6, height: 6)
                        Text("\(deck.dueCount) Due for review")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.coral)
                    }
                } else {
                    Text("Up to date")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(iTuTheme.mint)
                }

                Spacer()

                HStack(spacing: 8) {
                    Button("Open Deck", action: onOpenDeck)
                        .buttonStyle(iTuGhostButtonStyle(height: 32))
                    Button("Review Deck", action: onStartReview)
                        .buttonStyle(iTuSecondaryButtonStyle(height: 32))
                }
            }
        }
        .padding(16)
        .iTuHoverCard()
        .iTuPanel(radius: 14)
        .contextMenu {
            Button("Open Deck", action: onOpenDeck)
            Button("Review Deck", action: onStartReview)
            Divider()
            Button("Archive Deck", role: .destructive, action: onArchive)
        }
    }
}

private struct DeckDetailView: View {
    @Environment(AppModel.self) private var model
    let deck: DeckModel
    let onBack: () -> Void
    let onStartReview: () -> Void

    @State private var cards: [CardModel] = []
    @State private var showEditor = false
    @State private var editingCard: CardModel?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 5) {
                    iTuSectionLabel(title: "DECK DETAIL", color: iTuTheme.teal)
                    Text(deck.title)
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                    Text("\(cards.count) cards · \(deck.dueCount) due for review")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                }

                if cards.isEmpty {
                    VStack(spacing: 10) {
                        Image(systemName: "rectangle.stack.badge.plus")
                            .font(.system(size: 34))
                            .foregroundStyle(iTuTheme.inkDim)
                        Text("No cards in this deck")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)
                        Text("Add a prompt and answer to start building your review queue.")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 48)
                    .iTuPanel(radius: 14)
                } else {
                    VStack(spacing: 10) {
                        ForEach(cards) { card in
                            CardRowView(
                                card: card,
                                onEdit: {
                                    editingCard = card
                                    showEditor = true
                                },
                                onDelete: {
                                    Task {
                                        await model.deleteCard(id: card.id)
                                        await model.loadCards(for: deck)
                                        cards = model.cardsByDeckId[deck.id] ?? []
                                    }
                                }
                            )
                        }
                    }
                }
            }
            .padding(24)
            .frame(maxWidth: 980)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .iTuPinnedHeader {
            HStack {
                Button {
                    onBack()
                } label: {
                    Label("Decks", systemImage: "chevron.left")
                }
                .buttonStyle(iTuGhostButtonStyle())

                Spacer()

                Button("Review Due", action: onStartReview)
                    .buttonStyle(iTuSecondaryButtonStyle(height: 34))
                Button {
                    editingCard = nil
                    showEditor = true
                } label: {
                    Label("Add Card", systemImage: "plus")
                }
                .buttonStyle(iTuPrimaryButtonStyle(height: 34))
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 18)
        }
        .background(iTuTheme.canvas)
        .onAppear {
            cards = model.cardsByDeckId[deck.id] ?? []
            Task {
                await model.loadCards(for: deck)
                cards = model.cardsByDeckId[deck.id] ?? []
            }
        }
        .sheet(isPresented: $showEditor) {
            CardEditorSheet(card: editingCard) { front, back in
                Task {
                    if let editingCard {
                        await model.updateCard(id: editingCard.id, frontMarkdown: front, backMarkdown: back)
                    } else {
                        await model.createCard(deckId: deck.id, frontMarkdown: front, backMarkdown: back)
                    }
                    await model.loadCards(for: deck)
                    cards = model.cardsByDeckId[deck.id] ?? []
                }
            }
        }
    }
}

private struct CardRowView: View {
    let card: CardModel
    let onEdit: () -> Void
    let onDelete: () -> Void
    @State private var isHovered = false

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(card.frontMarkdown)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                    .lineLimit(3)
                Text(card.backMarkdown)
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
                    .lineLimit(3)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 8) {
                Text(card.type == "REVERSE" ? "REVERSE" : "BASIC")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.teal)
                HStack(spacing: 6) {
                    Button("Edit", action: onEdit)
                        .buttonStyle(iTuGhostButtonStyle(height: 28))
                    Button {
                        onDelete()
                    } label: {
                        Image(systemName: "trash")
                    }
                    .buttonStyle(iTuGhostButtonStyle(height: 28))
                    .help("Archive card")
                }
            }
        }
        .padding(14)
        .background(isHovered ? iTuTheme.mintTint.opacity(0.35) : iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
        .onHover { isHovered = $0 }
        .contextMenu {
            Button("Edit Card", action: onEdit)
            Button("Archive Card", action: onDelete)
        }
    }
}

private struct CardEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    let card: CardModel?
    let onSave: (String, String) -> Void
    @State private var front: String
    @State private var back: String

    init(card: CardModel?, onSave: @escaping (String, String) -> Void) {
        self.card = card
        self.onSave = onSave
        _front = State(initialValue: card?.frontMarkdown ?? "")
        _back = State(initialValue: card?.backMarkdown ?? "")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(card == nil ? "Add Card" : "Edit Card")
                    .font(.system(size: 18, weight: .bold))
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(iTuGhostButtonStyle())
            }

            Text("PROMPT / FRONT")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.inkFaint)
            TextEditor(text: $front)
                .font(.system(size: 13))
                .frame(height: 90)
                .overlay { RoundedRectangle(cornerRadius: 8).stroke(iTuTheme.border) }

            Text("ANSWER / BACK")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.inkFaint)
            TextEditor(text: $back)
                .font(.system(size: 13))
                .frame(height: 110)
                .overlay { RoundedRectangle(cornerRadius: 8).stroke(iTuTheme.border) }

            HStack {
                Spacer()
                Button(card == nil ? "Create Card" : "Save Changes") {
                    onSave(front.trimmingCharacters(in: .whitespacesAndNewlines), back.trimmingCharacters(in: .whitespacesAndNewlines))
                    dismiss()
                }
                .buttonStyle(iTuPrimaryButtonStyle())
                .disabled(front.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || back.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(24)
        .frame(width: 520, height: 420)
    }
}

private struct ReviewSessionView: View {
    @Environment(AppModel.self) private var model

    let deck: DeckModel
    let onExit: () -> Void

    @State private var cards: [CardModel] = []
    @State private var currentIndex = 0
    @State private var isFlipped = false
    @State private var isCompleted = false
    @State private var isLoadingCards = true
    @State private var sessionId: String?
    @State private var gradeTotal = 0
    @State private var gradeCount = 0
    @State private var userAnswer = ""

    var body: some View {
        VStack(spacing: 20) {
            if isLoadingCards {
                ProgressView("Loading cards…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if isCompleted || cards.isEmpty {
                VStack(spacing: 16) {
                    Image(systemName: cards.isEmpty ? "rectangle.stack.badge.plus" : "checkmark.seal.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(iTuTheme.mint)

                    Text(cards.isEmpty ? "No cards yet" : "Session Completed!")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)

                    Text(cards.isEmpty ? "Add cards to this deck from the web client to begin reviewing." : "You reviewed all due cards in this deck.")
                        .font(.system(size: 13))
                        .foregroundStyle(iTuTheme.inkDim)

                    Button("Back to Decks", action: onExit)
                        .buttonStyle(iTuPrimaryButtonStyle())
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                let currentCard = cards[currentIndex]

                // Flip Card
                VStack(spacing: 16) {
                    ZStack {
                        VStack(alignment: .leading, spacing: 14) {
                            iTuSectionLabel(title: isFlipped ? "ANSWER / BACK" : "QUESTION / FRONT", color: isFlipped ? iTuTheme.teal : iTuTheme.amber)

                            let front = currentCard.reviewDirection == "BACK_TO_FRONT" ? currentCard.backMarkdown : currentCard.frontMarkdown
                            let back = currentCard.reviewDirection == "BACK_TO_FRONT" ? currentCard.frontMarkdown : currentCard.backMarkdown
                            Text(isFlipped ? back : front)
                                .font(.system(size: 18, weight: .medium))
                                .foregroundStyle(iTuTheme.ink)
                                .multilineTextAlignment(.leading)

                            Spacer()

                            if !isFlipped {
                                Text("Click card or press Space to reveal answer")
                                    .font(.system(size: 11))
                                    .foregroundStyle(iTuTheme.inkFaint)
                            }
                        }
                        .padding(28)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    }
                    .iTuPanel(radius: 16)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            isFlipped.toggle()
                        }
                    }
                    .pointingHandCursor()
                }
                .padding(.horizontal, 24)
                .frame(maxHeight: 380)

                if !isFlipped {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("YOUR ANSWER")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkFaint)
                        TextEditor(text: $userAnswer)
                            .font(.system(size: 13))
                            .scrollContentBackground(.hidden)
                            .padding(8)
                            .frame(minHeight: 74)
                            .background(iTuTheme.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .stroke(iTuTheme.border, lineWidth: 1)
                            }
                            .overlay(alignment: .topLeading) {
                                if userAnswer.isEmpty {
                                    Text("Recall the answer in your own words…")
                                        .font(.system(size: 13))
                                        .foregroundStyle(iTuTheme.inkFaint)
                                        .padding(.horizontal, 12)
                                        .padding(.top, 12)
                                        .allowsHitTesting(false)
                                }
                            }
                    }
                    .padding(.horizontal, 24)
                }

                // Grading Controls
                if isFlipped {
                    HStack(spacing: 12) {
                        gradeButton("Again", color: iTuTheme.coral, bg: iTuTheme.coralTint) { gradeCard(1) }
                        gradeButton("Hard", color: iTuTheme.amber, bg: iTuTheme.amberTint) { gradeCard(2) }
                        gradeButton("Good", color: iTuTheme.teal, bg: iTuTheme.mintTint) { gradeCard(3) }
                        gradeButton("Easy", color: iTuTheme.mint, bg: iTuTheme.mintTint) { gradeCard(4) }
                    }
                    .padding(.horizontal, 24)
                }
            }

            Spacer()
        }
        .iTuPinnedHeader {
            iTuPageHeader(
                kicker: "LEARNING",
                title: "Review",
                description: "\(deck.title) · Recall the answer, reveal it when ready, then grade the card.",
                actions: {
                    if !cards.isEmpty && !isCompleted {
                        Text("Card \(currentIndex + 1) of \(cards.count)")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.pageHeaderForegroundMuted)
                    }
                    Button {
                        onExit()
                    } label: {
                        Label("Exit Review", systemImage: "chevron.left")
                    }
                    .buttonStyle(iTuHeaderGhostButtonStyle())
                }
            )
        }
        .background(iTuTheme.canvas)
        .onAppear {
            cards = model.cardsByDeckId[deck.id] ?? []
            Task {
                await model.loadDueCards(for: deck)
                cards = model.cardsByDeckId[deck.id] ?? []
                isLoadingCards = false
                sessionId = await model.startStudySession(deckId: deck.id)
            }
        }
    }

    private func gradeButton(_ label: String, color: Color, bg: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(color)
                .frame(maxWidth: .infinity)
                .frame(height: 38)
                .background(bg)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .stroke(color.opacity(0.3), lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
    }

    private func gradeCard(_ grade: Int) {
        let currentCard = cards[currentIndex]
        let serverGrade: String = switch grade {
        case 1: "AGAIN"
        case 2: "HARD"
        case 3: "GOOD"
        default: "EASY"
        }
        if let sessionId {
            Task {
                await model.submitReview(
                    sessionId: sessionId,
                    cardId: currentCard.id,
                    grade: serverGrade,
                    direction: currentCard.reviewDirection
                )
            }
        }
        gradeTotal += grade
        gradeCount += 1
        userAnswer = ""
        withAnimation {
            isFlipped = false
            if currentIndex + 1 < cards.count {
                currentIndex += 1
            } else {
                isCompleted = true
                if let sessionId {
                    let rating = gradeCount == 0 ? 1 : max(1, min(10, Int(round(Double(gradeTotal) / Double(gradeCount) * 2.5))))
                    Task { await model.completeStudySession(sessionId: sessionId, rating: rating) }
                }
            }
        }
    }
}

private struct CreateDeckSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onSave: (String, String) -> Void

    @State private var title = ""
    @State private var description = ""

    var body: some View {
        VStack(spacing: 20) {
            HStack {
                Text("New Deck")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Button("Cancel") { dismiss() }
                    .buttonStyle(iTuGhostButtonStyle())
            }

            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("DECK TITLE")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                    TextField("e.g., Swift & SwiftUI Mastery", text: $title)
                        .textFieldStyle(.roundedBorder)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("DESCRIPTION")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                    TextField("Brief topic overview", text: $description)
                        .textFieldStyle(.roundedBorder)
                }
            }

            Spacer()

            Button("Create Deck") {
                onSave(
                    title.trimmingCharacters(in: .whitespacesAndNewlines),
                    description.trimmingCharacters(in: .whitespacesAndNewlines)
                )
                dismiss()
            }
            .buttonStyle(iTuPrimaryButtonStyle())
            .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(24)
        .frame(width: 400, height: 320)
    }
}

private struct StudyHistoryView: View {
    @Environment(AppModel.self) private var model
    let onBack: () -> Void

    @State private var selectedSessionID: String?
    @State private var hoveredSessionID: String?

    private var selectedSession: StudySessionHistoryItem? {
        let id = selectedSessionID ?? model.studySessionHistory.first?.id
        return model.studySessionHistory.first { $0.id == id }
    }

    var body: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .top, spacing: 16) {
                    sessionList
                        .frame(width: 330)
                    sessionDetail
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                }
            }
            .padding(24)
            .frame(maxWidth: 1100)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .iTuPinnedHeader {
            iTuPageHeader(
                kicker: "STUDY ARCHIVE",
                title: "Learning history",
                description: "Browse completed sessions and saved study feedback.",
                actions: {
                    Button(action: onBack) {
                        Label("Decks", systemImage: "chevron.left")
                    }
                    .buttonStyle(iTuHeaderGhostButtonStyle())
                }
            )
        }
        .background(iTuTheme.canvas)
        .onAppear {
            Task {
                await model.refreshStudySessionHistory()
                selectedSessionID = model.studySessionHistory.first?.id
                if let selectedSession { await model.loadStudySessionDetails(for: selectedSession) }
            }
        }
        .onChange(of: selectedSessionID) {
            if let selectedSession { Task { await model.loadStudySessionDetails(for: selectedSession) } }
        }
    }

    private var sessionList: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Sessions", systemImage: "calendar")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)

            if model.studySessionHistory.isEmpty {
                Text("No completed study sessions yet.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
                    .frame(maxWidth: .infinity, minHeight: 120)
            } else {
                ForEach(model.studySessionHistory) { session in
                    Button {
                        selectedSessionID = session.id
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(session.deckTitle ?? "All decks")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(iTuTheme.ink)
                            Text(Self.formatDate(session.completedAt))
                                .font(.system(size: 11))
                                .foregroundStyle(iTuTheme.inkDim)
                            Text("\(session.correctRate)% remembered · \(session.reviewed) cards · rating \(session.rating.map(String.init) ?? "-")/10")
                                .font(.system(size: 10, weight: .medium, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(
                            selectedSessionID == session.id
                                ? iTuTheme.mintTint.opacity(0.45)
                                : (hoveredSessionID == session.id ? iTuTheme.mintTint.opacity(0.22) : iTuTheme.surface)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .stroke(selectedSessionID == session.id ? iTuTheme.teal : iTuTheme.border, lineWidth: 1)
                        }
                    }
                    .buttonStyle(.plain)
                    .onHover { isHovered in hoveredSessionID = isHovered ? session.id : nil }
                    .contextMenu {
                        Button("Open Session") { selectedSessionID = session.id }
                    }
                }
            }
        }
        .padding(16)
        .iTuPanel(radius: 14)
    }

    private var sessionDetail: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Session Details", systemImage: "text.bubble")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(iTuTheme.ink)

            if let selectedSession, let details = model.studySessionDetails[selectedSession.id] {
                HStack(spacing: 0) {
                    historyMetric("REMEMBERED", value: "\(details.correctRate)%")
                    historyMetric("CARDS", value: "\(details.reviewed)")
                    historyMetric("CORRECT", value: "\(details.correct)")
                    historyMetric("RATING", value: "\(details.rating.map(String.init) ?? "-")/10")
                }
                .padding(14)
                .background(iTuTheme.canvas)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                if let feedback = details.feedback {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Saved Study Feedback")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(iTuTheme.teal)
                        Text(feedback.summary)
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.ink)
                        if !feedback.nextSteps.isEmpty {
                            Text("NEXT STEPS")
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)
                            ForEach(feedback.nextSteps, id: \.self) { step in
                                Text("• \(step)")
                                    .font(.system(size: 12))
                                    .foregroundStyle(iTuTheme.inkDim)
                            }
                        }
                    }
                    .padding(14)
                    .background(iTuTheme.mintTint.opacity(0.35))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                } else {
                    Text("No saved feedback for this session.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                }

                ForEach(Array(details.reviews.enumerated()), id: \.offset) { index, review in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("CARD \(index + 1)")
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)
                            Spacer()
                            Text(review.grade)
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.teal)
                        }
                        HStack(alignment: .top, spacing: 16) {
                            historyRichText("PROMPT", review.promptRichText)
                            historyRichText("ANSWER", review.answerRichText)
                        }
                        if let answer = review.userAnswer, !answer.isEmpty {
                            Text("Your answer: \(answer)")
                                .font(.system(size: 12))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                    }
                    .padding(14)
                    .iTuPanel(radius: 10)
                }
            } else if selectedSession != nil {
                ProgressView("Loading session…")
                    .frame(maxWidth: .infinity, minHeight: 180)
            } else {
                Text("Select a session to inspect it.")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
                    .frame(maxWidth: .infinity, minHeight: 180)
            }
        }
        .padding(16)
        .iTuPanel(radius: 14)
    }

    private func historyMetric(_ label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.inkFaint)
            Text(value)
                .font(.system(size: 20, weight: .black))
                .foregroundStyle(iTuTheme.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func historyRichText(_ label: String, _ text: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.inkFaint)
            Text(text)
                .font(.system(size: 12))
                .foregroundStyle(iTuTheme.ink)
                .lineLimit(6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private static func formatDate(_ value: String?) -> String {
        guard let value, let date = ISO8601DateFormatter().date(from: value) else { return "Completed" }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
