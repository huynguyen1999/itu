import Foundation

private struct DueCardResponse: Decodable {
    let card: CardModel
    let state: DueCardState
}

private struct DueCardState: Decodable {
    let direction: String
}

extension APIClient {
    // MARK: - Study

    func fetchDecks() async throws -> [DeckModel] {
        let page: CursorPageResponse<DeckModel> = try await request(path: "/decks")
        return page.data
    }

    func fetchCards(deckId: String) async throws -> [CardModel] {
        let page: CursorPageResponse<CardModel> = try await request(path: "/decks/\(deckId)/cards")
        return page.data
    }

    func fetchDueCards(deckId: String) async throws -> [CardModel] {
        let items: [DueCardResponse] = try await request(path: "/study/due?deckId=\(deckId)")
        return items.map { item in
            var card = item.card
            card.reviewDirection = item.state.direction
            return card
        }
    }

    func fetchStudySessionHistory() async throws -> [StudySessionHistoryItem] {
        let page: CursorPageResponse<StudySessionHistoryItem> = try await request(path: "/study/sessions?limit=50")
        return page.data
    }

    func fetchStudySessionDetails(sessionId: String) async throws -> StudySessionDetails {
        try await request(path: "/study/sessions/\(sessionId)")
    }

    func startStudySession(deckId: String, mode: String = "DUE") async throws -> String {
        let sessionId = ULID.generate()
        let _: EmptyResponse = try await request(
            path: "/study/sessions",
            method: "POST",
            body: [
                "id": .string(sessionId),
                "deckId": .string(deckId),
                "mode": .string(mode)
            ] as [String: JSONValue]
        )
        return sessionId
    }

    func submitReview(
        sessionId: String,
        cardId: String,
        grade: String,
        idempotencyKey: String = ULID.generate()
    ) async throws {
        let _: EmptyResponse = try await request(
            path: "/study/sessions/\(sessionId)/reviews",
            method: "POST",
            body: [
                "cardId": .string(cardId),
                "direction": .string("FRONT_TO_BACK"),
                "grade": .string(grade),
                "idempotencyKey": .string(idempotencyKey)
            ] as [String: JSONValue]
        )
    }

    func completeStudySession(sessionId: String, rating: Int) async throws {
        let _: EmptyResponse = try await request(
            path: "/study/sessions/\(sessionId)/complete",
            method: "POST",
            body: ["rating": .number(Double(max(1, min(10, rating))))] as [String: JSONValue]
        )
    }
}
