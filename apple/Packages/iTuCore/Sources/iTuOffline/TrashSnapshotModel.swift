import Foundation
import iTuDomain

public struct TrashSnapshotModel: Decodable, Sendable {
    public var decks: [DeckModel]
    public var cards: [CardModel]
    public var tasks: [ProductivityTask]
    public var journalEntries: [JournalNoteModel]
    public var expenses: [ExpenseModel]
    public var gymWorkouts: [WorkoutModel]
    public var gymExercises: [ExerciseModel]

    private enum CodingKeys: String, CodingKey {
        case decks, cards, tasks, journalEntries, expenses, gymWorkouts, gymExercises
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        decks = try values.decodeIfPresent([DeckModel].self, forKey: .decks) ?? []
        cards = try values.decodeIfPresent([CardModel].self, forKey: .cards) ?? []
        tasks = try values.decodeIfPresent([ProductivityTask].self, forKey: .tasks) ?? []
        journalEntries = try values.decodeIfPresent([JournalNoteModel].self, forKey: .journalEntries) ?? []
        expenses = try values.decodeIfPresent([ExpenseModel].self, forKey: .expenses) ?? []
        gymWorkouts = try values.decodeIfPresent([WorkoutModel].self, forKey: .gymWorkouts) ?? []
        gymExercises = try values.decodeIfPresent([ExerciseModel].self, forKey: .gymExercises) ?? []
    }
}
