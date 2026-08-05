import Foundation

@MainActor
extension AppModel {
    func createDeck(title: String, description: String) async {
        do {
            let result = try await offlineStore.createDeck(title: title, description: description)
            apply(result.snapshot)
            syncPhase = .pending
        } catch {
            errorMessage = "Could not create deck: \(error.localizedDescription)"
        }
    }

    func loadCards(for deck: DeckModel) async {
        do {
            let cards = try await apiClient.fetchCards(deckId: deck.id)
            apply(try await offlineStore.updateCards(deckId: deck.id, cards: cards))
        } catch {
            // Keep the last locally cached cards when offline.
        }
    }

    func loadDueCards(for deck: DeckModel) async {
        do {
            let cards = try await apiClient.fetchDueCards(deckId: deck.id)
            apply(try await offlineStore.updateCards(deckId: deck.id, cards: cards))
        } catch {
            // Keep the last locally cached cards when offline.
        }
    }

    func loadStudySessionDetails(for session: StudySessionHistoryItem) async {
        if studySessionDetails[session.id] != nil { return }
        do {
            studySessionDetails[session.id] = try await apiClient.fetchStudySessionDetails(sessionId: session.id)
        } catch {
            // Keep the history list usable when the detail request is unavailable offline.
        }
    }

    func refreshStudySessionHistory() async {
        do {
            studySessionHistory = try await apiClient.fetchStudySessionHistory()
        } catch {
            // Keep cached history available when the server is offline.
        }
    }

    func createCard(deckId: String, frontMarkdown: String, backMarkdown: String) async {
        do {
            let result = try await offlineStore.createCard(
                deckId: deckId,
                frontMarkdown: frontMarkdown,
                backMarkdown: backMarkdown
            )
            apply(result.snapshot)
            syncPhase = .pending
        } catch {
            errorMessage = "Could not create card: \(error.localizedDescription)"
        }
    }

    func updateCard(id: String, frontMarkdown: String, backMarkdown: String) async {
        do {
            apply(try await offlineStore.updateCard(id: id, frontMarkdown: frontMarkdown, backMarkdown: backMarkdown))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not update card: \(error.localizedDescription)"
        }
    }

    func deleteCard(id: String) async {
        do {
            apply(try await offlineStore.deleteCard(id: id))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not archive card: \(error.localizedDescription)"
        }
    }

    func startStudySession(deckId: String) async -> String? {
        do {
            let result = try await offlineStore.startStudySession(deckId: deckId)
            apply(result.snapshot)
            syncPhase = .pending
            return result.sessionId
        } catch {
            errorMessage = "Could not start study session: \(error.localizedDescription)"
            return nil
        }
    }

    func submitReview(sessionId: String, cardId: String, grade: String, direction: String = "FRONT_TO_BACK") async {
        do {
            apply(try await offlineStore.submitReview(
                sessionId: sessionId,
                cardId: cardId,
                grade: grade,
                direction: direction,
                idempotencyKey: ULID.generate()
            ))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not save review: \(error.localizedDescription)"
        }
    }

    func completeStudySession(sessionId: String, rating: Int) async {
        do {
            apply(try await offlineStore.completeStudySession(sessionId: sessionId, rating: rating))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not complete study session: \(error.localizedDescription)"
        }
    }


}
