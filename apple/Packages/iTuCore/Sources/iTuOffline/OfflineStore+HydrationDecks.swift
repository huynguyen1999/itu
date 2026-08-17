import Foundation
import iTuDomain
public extension OfflineStore {
    func applyHydratedDecks(_ fetched: [DeckModel]) throws {
        let optimistic = Dictionary(uniqueKeysWithValues: state.decks.map { ($0.id, $0) })
        let fetchedIDs = Set(fetched.map(\.id))
        let pendingIDs = Set(state.mutations.filter { $0.kind == "deck.create" || $0.kind == "deck.restore" }.map(\.entityId))
        state.decks = fetched + state.decks.filter { !fetchedIDs.contains($0.id) && pendingIDs.contains($0.id) }
        var latestDeckOperationByID: [String: String] = [:]
        for mutation in state.mutations where mutation.kind == "deck.delete" || mutation.kind == "deck.restore" {
            latestDeckOperationByID[mutation.entityId] = mutation.kind
        }
        let deletedDeckIDs = Set(latestDeckOperationByID.compactMap { $0.value == "deck.delete" ? $0.key : nil })
        state.decks.removeAll { deletedDeckIDs.contains($0.id) }
        for mutation in state.mutations where mutation.kind == "deck.create" || mutation.kind == "deck.restore" {
            if !state.decks.contains(where: { $0.id == mutation.entityId }), let deck = optimistic[mutation.entityId] {
                state.decks.append(deck)
            }
        }
        for deckID in Set(state.cardsByDeckId.keys).subtracting(Set(state.decks.map(\.id))) {
            state.cardsByDeckId.removeValue(forKey: deckID)
        }
    }
}
