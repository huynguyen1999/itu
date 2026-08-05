import Foundation

extension OfflineStore {
    @discardableResult
    func updateDecks(_ fetchedDecks: [DeckModel]) throws -> OfflineSnapshot {
        let optimisticDecksByID = Dictionary(uniqueKeysWithValues: state.decks.map { ($0.id, $0) })
        for deck in fetchedDecks {
            if let index = state.decks.firstIndex(where: { $0.id == deck.id }) {
                state.decks[index] = deck
            } else {
                state.decks.append(deck)
            }
        }
        for mutation in state.mutations where mutation.kind == "deck.restore" {
            guard !state.decks.contains(where: { $0.id == mutation.entityId }),
                  let optimistic = optimisticDecksByID[mutation.entityId] else { continue }
            state.decks.append(optimistic)
        }
        var latestDeckOperationByID: [String: String] = [:]
        for mutation in state.mutations where mutation.kind == "deck.delete" || mutation.kind == "deck.restore" {
            latestDeckOperationByID[mutation.entityId] = mutation.kind
        }
        let deletedDeckIDs = Set(
            latestDeckOperationByID.compactMap { $0.value == "deck.delete" ? $0.key : nil }
        )
        state.decks.removeAll { deletedDeckIDs.contains($0.id) }
        for deckID in deletedDeckIDs {
            state.cardsByDeckId.removeValue(forKey: deckID)
        }
        try persist()
        return state
    }

    @discardableResult
    func restoreDeck(_ deck: DeckModel) throws -> OfflineSnapshot {
        if !state.decks.contains(where: { $0.id == deck.id }) {
            state.decks.append(deck)
        }
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "deck.restore",
            entityId: deck.id,
            payload: [:],
            occurredAt: ISO8601DateFormatter().string(from: Date())
        ))
        try persist()
        return state
    }

    @discardableResult
    func deleteDeck(id: String) throws -> OfflineSnapshot {
        guard let deck = state.decks.first(where: { $0.id == id }) else { return state }
        state.decks.removeAll { $0.id == id }
        state.cardsByDeckId.removeValue(forKey: id)
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "deck.delete",
            entityId: id,
            baseVersion: deck.version,
            payload: [:],
            occurredAt: ISO8601DateFormatter().string(from: Date())
        ))
        try persist()
        return state
    }

    @discardableResult
    func createDeck(title: String, description: String) throws -> (deck: DeckModel, snapshot: OfflineSnapshot) {
        let id = ULID.generate()
        let now = ISO8601DateFormatter().string(from: Date())
        let deck = DeckModel(
            id: id,
            title: title,
            description: description,
            cardCount: 0,
            dueCount: 0,
            color: "teal",
            icon: "book.closed"
        )
        state.decks.append(deck)
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "deck.create",
            entityId: id,
            payload: [
                "title": .string(title),
                "description": .string(description),
                "icon": .string("BOOK"),
                "color": .string("TEAL")
            ],
            occurredAt: now
        ))
        try persist()
        return (deck, state)
    }

    @discardableResult
    func updateCards(deckId: String, cards: [CardModel]) throws -> OfflineSnapshot {
        let optimisticCardsByID = Dictionary(
            uniqueKeysWithValues: (state.cardsByDeckId[deckId] ?? []).map { ($0.id, $0) }
        )
        state.cardsByDeckId[deckId] = cards
        try reapplyPendingCardMutations(deckId: deckId, optimisticCardsByID: optimisticCardsByID)
        if let index = state.decks.firstIndex(where: { $0.id == deckId }) {
            state.decks[index].cardCount = cards.count
            state.decks[index].dueCount = cards.filter { $0.state == "review" }.count
        }
        try persist()
        return state
    }

    @discardableResult
    func restoreCard(_ card: CardModel) throws -> OfflineSnapshot {
        var cards = state.cardsByDeckId[card.deckId] ?? []
        if !cards.contains(where: { $0.id == card.id }) {
            cards.append(card)
        }
        state.cardsByDeckId[card.deckId] = cards
        updateDeckCardCount(deckId: card.deckId, cards: cards)
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "card.restore",
            entityId: card.id,
            payload: [:],
            occurredAt: ISO8601DateFormatter().string(from: Date())
        ))
        try persist()
        return state
    }

    @discardableResult
    func createCard(deckId: String, frontMarkdown: String, backMarkdown: String) throws -> (card: CardModel, snapshot: OfflineSnapshot) {
        let card = CardModel(
            id: ULID.generate(),
            deckId: deckId,
            frontMarkdown: frontMarkdown,
            backMarkdown: backMarkdown,
            state: "new",
            intervalDays: 0,
            easeFactor: 2.5
        )
        var cards = state.cardsByDeckId[deckId] ?? []
        cards.append(card)
        state.cardsByDeckId[deckId] = cards
        updateDeckCardCount(deckId: deckId, cards: cards)
        let now = ISO8601DateFormatter().string(from: Date())
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "card.create",
            entityId: card.id,
            payload: [
                "deckId": .string(deckId),
                "type": .string(card.type),
                "promptRichText": .string(frontMarkdown),
                "answerRichText": .string(backMarkdown),
                "tags": .array([])
            ],
            occurredAt: now
        ))
        try persist()
        return (card, state)
    }

    @discardableResult
    func updateCard(id: String, frontMarkdown: String, backMarkdown: String) throws -> OfflineSnapshot {
        guard let deckID = state.cardsByDeckId.first(where: { $0.value.contains { $0.id == id } })?.key,
              let index = state.cardsByDeckId[deckID]?.firstIndex(where: { $0.id == id }) else {
            return state
        }
        let card = state.cardsByDeckId[deckID]![index]
        state.cardsByDeckId[deckID]![index].frontMarkdown = frontMarkdown
        state.cardsByDeckId[deckID]![index].backMarkdown = backMarkdown
        state.cardsByDeckId[deckID]![index].version += 1
        let now = ISO8601DateFormatter().string(from: Date())
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "card.update",
            entityId: id,
            baseVersion: card.version,
            payload: [
                "promptRichText": .string(frontMarkdown),
                "answerRichText": .string(backMarkdown)
            ],
            occurredAt: now
        ))
        try persist()
        return state
    }

    @discardableResult
    func deleteCard(id: String) throws -> OfflineSnapshot {
        guard let deckID = state.cardsByDeckId.first(where: { $0.value.contains { $0.id == id } })?.key,
              let card = state.cardsByDeckId[deckID]?.first(where: { $0.id == id }) else {
            return state
        }
        state.cardsByDeckId[deckID]?.removeAll { $0.id == id }
        updateDeckCardCount(deckId: deckID, cards: state.cardsByDeckId[deckID] ?? [])
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "card.delete",
            entityId: id,
            baseVersion: card.version,
            payload: [:],
            occurredAt: ISO8601DateFormatter().string(from: Date())
        ))
        try persist()
        return state
    }

    internal func updateDeckCardCount(deckId: String, cards: [CardModel]) {
        guard let index = state.decks.firstIndex(where: { $0.id == deckId }) else { return }
        state.decks[index].cardCount = cards.count
        state.decks[index].dueCount = cards.filter { $0.state == "review" }.count
    }

    internal func reapplyPendingCardMutations(
        deckId: String,
        optimisticCardsByID: [String: CardModel]
    ) throws {
        var cards = state.cardsByDeckId[deckId] ?? []
        for mutation in state.mutations where mutation.kind.hasPrefix("card.") {
            switch mutation.kind {
            case "card.create":
                guard case let .string(mutationDeckID)? = mutation.payload["deckId"], mutationDeckID == deckId,
                      !cards.contains(where: { $0.id == mutation.entityId }),
                      let optimistic = optimisticCardsByID[mutation.entityId] else { continue }
                cards.append(optimistic)
            case "card.update":
                guard let index = cards.firstIndex(where: { $0.id == mutation.entityId }) else { continue }
                let serverVersion = cards[index].version
                let encoded = try encoder.encode(cards[index])
                let value = try decoder.decode(JSONValue.self, from: encoded)
                guard case var .object(fields) = value else { continue }
                fields.merge(mutation.payload) { _, pending in pending }
                fields["version"] = .number(Double(max(serverVersion, optimisticCardsByID[mutation.entityId]?.version ?? serverVersion)))
                cards[index] = try decoder.decode(CardModel.self, from: encoder.encode(JSONValue.object(fields)))
            case "card.delete":
                cards.removeAll { $0.id == mutation.entityId }
            case "card.restore":
                guard !cards.contains(where: { $0.id == mutation.entityId }),
                      let optimistic = optimisticCardsByID[mutation.entityId] else { continue }
                cards.append(optimistic)
            default:
                continue
            }
        }
        state.cardsByDeckId[deckId] = cards
        updateDeckCardCount(deckId: deckId, cards: cards)
    }

    @discardableResult
    func startStudySession(deckId: String, mode: String = "DUE") throws -> (sessionId: String, snapshot: OfflineSnapshot) {
        let sessionId = ULID.generate()
        let now = ISO8601DateFormatter().string(from: Date())
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "session.start",
            entityId: sessionId,
            payload: ["deckId": .string(deckId), "mode": .string(mode)],
            occurredAt: now
        ))
        try persist()
        return (sessionId, state)
    }

    @discardableResult
    func submitReview(
        sessionId: String,
        cardId: String,
        grade: String,
        direction: String = "FRONT_TO_BACK",
        idempotencyKey: String = ULID.generate()
    ) throws -> OfflineSnapshot {
        let now = ISO8601DateFormatter().string(from: Date())
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "review.create",
            entityId: ULID.generate(),
            payload: [
                "sessionId": .string(sessionId),
                "cardId": .string(cardId),
                "direction": .string(direction),
                "grade": .string(grade),
                "idempotencyKey": .string(idempotencyKey)
            ],
            occurredAt: now
        ))
        try persist()
        return state
    }

    @discardableResult
    func completeStudySession(sessionId: String, rating: Int) throws -> OfflineSnapshot {
        let now = ISO8601DateFormatter().string(from: Date())
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "session.complete",
            entityId: sessionId,
            payload: ["rating": .number(Double(max(1, min(10, rating))))],
            occurredAt: now
        ))
        try persist()
        return state
    }


}
