import SwiftUI
import iTuDomain

struct Phase6LearnView: View {
    @EnvironmentObject private var model: AppModel
    @State private var searchText = ""
    @State private var showingNewDeck = false
    @State private var newDeckTitle = ""
    @State private var newDeckDescription = ""
    @State private var deckToDelete: DeckModel?
    @State private var isCreatingDeck = false
    @State private var deckError: String?
    @State private var isLoading = false
    @State private var loadError: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    if isLoading && model.decks.isEmpty {
                        ProgressView("Loading decks")
                            .frame(maxWidth: .infinity, minHeight: 120)
                    } else if let loadError, model.decks.isEmpty {
                        VStack(spacing: 12) {
                            Label("Learn unavailable", systemImage: "exclamationmark.triangle")
                                .font(.headline)
                            Text(loadError)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                            Button("Retry") { Task { await reload() } }
                                .buttonStyle(.borderedProminent)
                        }
                        .frame(maxWidth: .infinity, minHeight: 180)
                    } else if filteredDecks.isEmpty {
                        IOSContentUnavailableView(
                            searchText.isEmpty ? "No flashcard decks" : "No matching decks",
                            systemImage: "rectangle.stack",
                            description: searchText.isEmpty ? "Create a deck to start learning." : "Try a different search."
                        )
                    } else {
                        ForEach(filteredDecks) { deck in
                            NavigationLink {
                                Phase6DeckDetailView(deck: deck)
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(deck.title).font(.headline)
                                    Text("\(deck.cardCount) cards · \(deck.dueCount) due")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    if model.pendingMutations.contains(where: { $0.entityId == deck.id }) {
                                        Label("Pending sync", systemImage: "clock.arrow.circlepath")
                                            .font(.caption2)
                                            .foregroundStyle(.orange)
                                    }
                                }
                            }
                            .swipeActions {
                                Button("Delete", role: .destructive) { deckToDelete = deck }
                            }
                        }
                    }
                } header: {
                    if model.decks.isEmpty { Text("Decks") }
                }
            }
            .navigationTitle("Learn")
            .searchable(text: $searchText, prompt: "Search decks")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { Task { await reload() } } label: {
                        if isLoading { ProgressView() } else { Label("Refresh", systemImage: "arrow.clockwise") }
                    }
                    .disabled(isLoading)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingNewDeck = true } label: {
                        Label("New deck", systemImage: "plus")
                    }
                }
            }
        }
        .task { await reload() }
        .sheet(isPresented: $showingNewDeck) {
            NavigationStack {
                Form {
                    Section("Flashcard Deck") {
                        TextField("Title", text: $newDeckTitle)
                        TextField("Description", text: $newDeckDescription, axis: .vertical)
                        if let deckError {
                            Text(deckError).font(.footnote).foregroundStyle(.red)
                        }
                    }
                }
                .navigationTitle("New Deck")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showingNewDeck = false }
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Create") {
                            let title = newDeckTitle
                            let description = newDeckDescription
                            isCreatingDeck = true
                            deckError = nil
                            Task { @MainActor in
                                let created = await model.createDeck(title: title, description: description)
                                if created {
                                    newDeckTitle = ""
                                    newDeckDescription = ""
                                    showingNewDeck = false
                                } else {
                                    deckError = "The deck could not be saved. Try again."
                                }
                                isCreatingDeck = false
                            }
                        }
                        .disabled(newDeckTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isCreatingDeck)
                        .overlay { if isCreatingDeck { ProgressView() } }
                    }
                }
            }
            .presentationDetents([.medium])
        }
        .confirmationDialog(
            "Delete this deck?",
            isPresented: Binding(
                get: { deckToDelete != nil },
                set: { if !$0 { deckToDelete = nil } }
            )
        ) {
            if let deck = deckToDelete {
                Button("Delete Deck", role: .destructive) {
                    Task { await model.deleteDeck(id: deck.id) }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            if let deck = deckToDelete {
                Text("\(deck.title) and its Flashcards will be removed from this device and queued for sync.")
            }
        }
    }

    private var filteredDecks: [DeckModel] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return model.decks }
        return model.decks.filter {
            $0.title.localizedCaseInsensitiveContains(query) || $0.description.localizedCaseInsensitiveContains(query)
        }
    }

    private func reload() async {
        isLoading = true
        loadError = nil
        let refreshed = await model.refreshLearn()
        if !refreshed { loadError = "The latest decks could not be loaded. Cached decks remain available." }
        isLoading = false
    }
}

private struct Phase6DeckDetailView: View {
    @EnvironmentObject private var model: AppModel
    let deck: DeckModel
    @State private var showingNewCard = false
    @State private var editingCard: CardModel?
    @State private var showingStudy = false
    @State private var cardToDelete: CardModel?
    @State private var cardError: String?
    @State private var isLoading = false
    @State private var loadError: String?

    private var cards: [CardModel] { model.cardsByDeckID[deck.id] ?? [] }
    private var dueCards: [CardModel] { cards.filter { $0.state == "review" || $0.state == "learning" } }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(deck.description).foregroundStyle(.secondary)
                    HStack {
                        Label("\(cards.count) cards", systemImage: "rectangle.stack")
                        Label("\(dueCards.count) due", systemImage: "clock")
                    }
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }
            }
            Section("Cards") {
                if isLoading && cards.isEmpty {
                    ProgressView("Loading Flashcards")
                        .frame(maxWidth: .infinity, minHeight: 100)
                } else if let loadError, cards.isEmpty {
                    VStack(spacing: 12) {
                        Label("Flashcards unavailable", systemImage: "exclamationmark.triangle")
                            .font(.headline)
                        Text(loadError)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                        Button("Retry") { Task { await reloadCards() } }
                            .buttonStyle(.borderedProminent)
                    }
                    .frame(maxWidth: .infinity, minHeight: 140)
                } else if let cardError {
                    Text(cardError).font(.footnote).foregroundStyle(.red)
                } else {
                    if cards.isEmpty {
                        IOSContentUnavailableView("No Flashcards", systemImage: "rectangle.stack.badge.plus", description: "Add a prompt and answer to this deck.")
                    } else {
                        ForEach(cards) { card in
                            Button { editingCard = card } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(card.frontMarkdown).lineLimit(2).foregroundStyle(.primary)
                                    Text(card.state.capitalized)
                                        .font(.caption)
                                        .foregroundStyle(card.state == "review" ? .orange : .secondary)
                                }
                            }
                            .swipeActions {
                                Button("Delete", role: .destructive) { cardToDelete = card }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle(deck.title)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { showingNewCard = true } label: { Label("New card", systemImage: "plus") }
                Button { showingStudy = true } label: { Label("Study", systemImage: "play.fill") }
                    .disabled(cards.isEmpty)
            }
        }
        .task { await reloadCards() }
        .sheet(isPresented: $showingNewCard) {
            Phase6CardEditorView(title: "New Flashcard") { front, back in
                await model.createCard(deckId: deck.id, frontMarkdown: front, backMarkdown: back)
            }
        }
        .sheet(item: $editingCard) { card in
            Phase6CardEditorView(title: "Edit Flashcard", card: card) { front, back in
                await model.updateCard(id: card.id, frontMarkdown: front, backMarkdown: back)
            }
        }
        .sheet(isPresented: $showingStudy) {
            Phase6StudySessionView(deck: deck, cards: dueCards.isEmpty ? cards : dueCards)
        }
        .confirmationDialog(
            "Delete this Flashcard?",
            isPresented: Binding(
                get: { cardToDelete != nil },
                set: { if !$0 { cardToDelete = nil } }
            )
        ) {
            if let card = cardToDelete {
                Button("Delete Flashcard", role: .destructive) {
                    cardToDelete = nil
                    Task { @MainActor in
                        let deleted = await model.deleteCard(id: card.id)
                        if !deleted { cardError = "The Flashcard could not be deleted. Try again." }
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            if let card = cardToDelete {
                Text("\(card.frontMarkdown) will be removed from this device and queued for sync.")
            }
        }
    }

    private func reloadCards() async {
        isLoading = true
        loadError = nil
        let loaded = await model.loadCards(for: deck)
        if !loaded { loadError = "The Flashcards could not be loaded. Try again." }
        isLoading = false
    }
}

private struct Phase6CardEditorView: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let card: CardModel?
    let save: (String, String) async -> Bool
    @State private var front: String
    @State private var back: String
    @State private var savedFront: String
    @State private var savedBack: String
    @State private var showingDiscard = false
    @State private var isSaving = false
    @State private var saveError: String?

    init(title: String, card: CardModel? = nil, save: @escaping (String, String) async -> Bool) {
        self.title = title
        self.card = card
        self.save = save
        _front = State(initialValue: card?.frontMarkdown ?? "")
        _back = State(initialValue: card?.backMarkdown ?? "")
        _savedFront = State(initialValue: card?.frontMarkdown ?? "")
        _savedBack = State(initialValue: card?.backMarkdown ?? "")
    }

    private var isDirty: Bool { front != savedFront || back != savedBack }

    var body: some View {
        NavigationStack {
            Form {
                if let saveError {
                    Text(saveError).font(.footnote).foregroundStyle(.red)
                }
                Section("Prompt") { TextEditor(text: $front).frame(minHeight: 120) }
                Section("Answer") { TextEditor(text: $back).frame(minHeight: 120) }
            }
            .navigationTitle(title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { requestDismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        isSaving = true
                        saveError = nil
                        Task {
                            let didSave = await save(front, back)
                            if didSave {
                                savedFront = front
                                savedBack = back
                                dismiss()
                            } else {
                                saveError = "The Flashcard could not be saved. Try again."
                            }
                            isSaving = false
                        }
                    } label: {
                        if isSaving { ProgressView() } else { Text("Save") }
                    }
                    .disabled(front.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
                }
            }
            .interactiveDismissDisabled(isDirty)
            .confirmationDialog("Discard changes?", isPresented: $showingDiscard) {
                Button("Discard Changes", role: .destructive) { dismiss() }
                Button("Keep Editing", role: .cancel) {}
            }
        }
    }

    private func requestDismiss() {
        if isDirty { showingDiscard = true } else { dismiss() }
    }
}

private struct Phase6StudySessionView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let deck: DeckModel
    let cards: [CardModel]
    @State private var sessionID: String?
    @State private var index = 0
    @State private var isRevealed = false
    @State private var grades: [IOSStudyGrade] = []
    @State private var isStarting = true
    @State private var isComplete = false
    @State private var isSubmittingReview = false
    @State private var completionRating: Int?
    @State private var studyError: String?

    private var currentCard: CardModel? { cards.indices.contains(index) ? cards[index] : nil }

    var body: some View {
        NavigationStack {
            Group {
                if isStarting {
                    ProgressView("Starting Study Session")
                } else if isComplete {
                    VStack(spacing: 16) {
                        Image(systemName: "checkmark.circle.fill").font(.system(size: 52)).foregroundStyle(.green)
                        Text("Study Session complete").font(.title2.bold())
                        Text("\(grades.count) Flashcards reviewed offline-first.").foregroundStyle(.secondary)
                        Button("Done") { dismiss() }.buttonStyle(.borderedProminent)
                    }
                    .padding()
                } else if let completionRating {
                    VStack(spacing: 16) {
                        Image(systemName: "clock.arrow.circlepath")
                            .font(.system(size: 44))
                            .foregroundStyle(.orange)
                        Text("Final review saved")
                            .font(.title3.bold())
                        if let studyError {
                            Text(studyError)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                        }
                        Button("Retry Completion") {
                            Task { await finishCompletion(rating: completionRating) }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(isSubmittingReview)
                    }
                    .padding()
                } else if let currentCard {
                    VStack(alignment: .leading, spacing: 20) {
                        if let studyError {
                            Label(studyError, systemImage: "exclamationmark.triangle")
                                .font(.subheadline)
                                .foregroundStyle(.orange)
                        }
                        ProgressView(value: Double(index), total: Double(max(cards.count, 1)))
                        Text("Card \(index + 1) of \(cards.count)").font(.caption).foregroundStyle(.secondary)
                        Text(currentCard.frontMarkdown)
                            .font(.title3)
                            .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
                            .padding()
                            .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        if isRevealed {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Answer").font(.headline)
                                Text(currentCard.backMarkdown)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                            .background(Color.green.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                                ForEach(IOSStudyGrade.allCases) { grade in
                                    Button { gradeCard(grade) } label: {
                                        Label(grade.title, systemImage: grade.systemImage)
                                            .labelStyle(.titleAndIcon)
                                            .frame(maxWidth: .infinity)
                                            .frame(minHeight: 44)
                                    }
                                    .buttonStyle(.bordered)
                                    .tint(grade == .again ? .orange : .accentColor)
                                    .disabled(isSubmittingReview)
                                }
                            }
                        } else {
                            Button("Reveal Answer") { isRevealed = true }
                                .buttonStyle(.borderedProminent)
                                .frame(maxWidth: .infinity)
                        }
                        Spacer()
                    }
                    .padding()
                } else {
                    IOSContentUnavailableView("Nothing due", systemImage: "checkmark.circle", description: "This deck has no cards ready for a Study Session.")
                }
            }
            .navigationTitle(deck.title)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() }.disabled(isSubmittingReview) }
                ToolbarItem(placement: .topBarTrailing) {
                    if model.pendingCount > 0 { Label("Pending", systemImage: "clock.arrow.circlepath").foregroundStyle(.orange) }
                }
            }
        }
        .task { await start() }
    }

    private func start() async {
        guard sessionID == nil else { return }
        sessionID = await model.startStudySession(deckId: deck.id)
        isStarting = false
        if sessionID == nil {
            studyError = "The Study Session could not be started. Check your local account and try again."
        }
    }

    private func gradeCard(_ grade: IOSStudyGrade) {
        guard !isSubmittingReview, let sessionID, let currentCard else { return }
        let isFinalCard = index + 1 >= cards.count
        isSubmittingReview = true
        studyError = nil
        Task { @MainActor in
            let submitted = await model.submitReview(sessionId: sessionID, cardId: currentCard.id, grade: grade.rawValue)
            guard submitted else {
                studyError = "The review could not be saved. Try again."
                isSubmittingReview = false
                return
            }

            let updatedGrades = grades + [grade]
            grades = updatedGrades
            if isFinalCard {
                let rating = max(1, min(10, 6 + updatedGrades.filter { $0 == .good || $0 == .easy }.count))
                completionRating = rating
                await finishCompletion(rating: rating)
            } else {
                index += 1
                isRevealed = false
                isSubmittingReview = false
            }
        }
    }

    private func finishCompletion(rating: Int) async {
        let completed = await model.completeStudySession(sessionId: sessionID ?? "", rating: rating)
        if completed {
            completionRating = nil
            studyError = nil
            isComplete = true
        } else {
            studyError = "The review was saved, but completion is still pending. Try again."
        }
        isSubmittingReview = false
    }
}
