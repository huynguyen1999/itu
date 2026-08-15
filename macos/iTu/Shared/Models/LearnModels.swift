import Foundation

struct DeckModel: Identifiable, Codable, Equatable, Sendable {
    let id: String
    var title: String
    var description: String
    var cardCount: Int
    var dueCount: Int
    var color: String
    var icon: String
    var lastReviewedAt: String?
    var version: Int = 1

    private enum CodingKeys: String, CodingKey {
        case id, title, description, cardCount, dueCount, color, icon, lastReviewedAt, version
        case isDefault, archived, studyStats
    }

    init(
        id: String,
        title: String,
        description: String,
        cardCount: Int,
        dueCount: Int,
        color: String,
        icon: String,
        lastReviewedAt: String? = nil,
        version: Int = 1
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.cardCount = cardCount
        self.dueCount = dueCount
        self.color = color
        self.icon = icon
        self.lastReviewedAt = lastReviewedAt
        self.version = version
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        title = try values.decodeIfPresent(String.self, forKey: .title) ?? "Untitled deck"
        description = try values.decodeIfPresent(String.self, forKey: .description) ?? ""
        cardCount = try values.decodeIfPresent(Int.self, forKey: .cardCount) ?? 0
        dueCount = try values.decodeIfPresent(Int.self, forKey: .dueCount) ?? 0
        if let stats = try values.decodeIfPresent(DeckStudyStats.self, forKey: .studyStats) {
            cardCount = stats.totalCards ?? cardCount
            dueCount = stats.dueCount ?? dueCount
            lastReviewedAt = stats.lastStudiedAt
        } else {
            lastReviewedAt = try values.decodeIfPresent(String.self, forKey: .lastReviewedAt)
        }
        let serverIcon = try values.decodeIfPresent(String.self, forKey: .icon) ?? "BOOK"
        icon = Self.sfSymbol(forServerIcon: serverIcon)
        color = (try values.decodeIfPresent(String.self, forKey: .color) ?? "teal").lowercased()
        version = try values.decodeIfPresent(Int.self, forKey: .version) ?? 1
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(id, forKey: .id)
        try values.encode(title, forKey: .title)
        try values.encode(description, forKey: .description)
        try values.encode(cardCount, forKey: .cardCount)
        try values.encode(dueCount, forKey: .dueCount)
        try values.encode(color, forKey: .color)
        try values.encode(icon, forKey: .icon)
        try values.encodeIfPresent(lastReviewedAt, forKey: .lastReviewedAt)
        try values.encode(version, forKey: .version)
    }

    private struct DeckStudyStats: Decodable {
        let totalCards: Int?
        let dueCount: Int?
        let lastStudiedAt: String?
    }

    private static func sfSymbol(forServerIcon icon: String) -> String {
        switch icon.uppercased() {
        case "INBOX": return "tray"
        case "BRAIN": return "brain"
        case "LANGUAGE": return "character.book.closed"
        case "FLASK": return "flask"
        case "CODE": return "chevron.left.forwardslash.chevron.right"
        case "LEAF": return "leaf"
        case "CALCULATOR": return "function"
        case "GLOBE": return "globe"
        default: return icon.contains(".") ? icon : "book.closed"
        }
    }

    static func sampleDecks() -> [DeckModel] {
        [
            DeckModel(id: "deck-1", title: "Swift & SwiftUI Mastery", description: "Design patterns, view lifecycle, and state management", cardCount: 24, dueCount: 8, color: "teal", icon: "swift"),
            DeckModel(id: "deck-2", title: "System Architecture", description: "Clean Architecture, Hexagonal patterns, and CQRS", cardCount: 16, dueCount: 3, color: "mint", icon: "server.rack"),
            DeckModel(id: "deck-3", title: "Productivity Principles", description: "Timeblocking, Eisenhower matrix, and Spaced Repetition", cardCount: 12, dueCount: 0, color: "amber", icon: "brain")
        ]
    }
}

struct CardModel: Identifiable, Codable, Equatable, Sendable {
    let id: String
    let deckId: String
    var type: String
    var frontMarkdown: String
    var backMarkdown: String
    var tags: [String]
    var state: String // new, learning, review
    var intervalDays: Int
    var easeFactor: Double
    var reviewDirection: String = "FRONT_TO_BACK"
    var version: Int = 1

    private enum CodingKeys: String, CodingKey {
        case id, deckId, type, frontMarkdown, backMarkdown, promptRichText, answerRichText
        case tags, state, intervalDays, easeFactor, reviewDirection, version
    }

    init(
        id: String,
        deckId: String,
        frontMarkdown: String,
        backMarkdown: String,
        state: String,
        intervalDays: Int,
        easeFactor: Double,
        reviewDirection: String = "FRONT_TO_BACK",
        type: String = "BASIC",
        tags: [String] = [],
        version: Int = 1
    ) {
        self.id = id
        self.deckId = deckId
        self.type = type
        self.frontMarkdown = frontMarkdown
        self.backMarkdown = backMarkdown
        self.tags = tags
        self.state = state
        self.intervalDays = intervalDays
        self.easeFactor = easeFactor
        self.reviewDirection = reviewDirection
        self.version = version
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(String.self, forKey: .id)
        deckId = try values.decode(String.self, forKey: .deckId)
        type = try values.decodeIfPresent(String.self, forKey: .type) ?? "BASIC"
        let decodedFront = try values.decodeIfPresent(String.self, forKey: .frontMarkdown)
        let prompt = try values.decodeIfPresent(String.self, forKey: .promptRichText)
        frontMarkdown = decodedFront ?? prompt ?? ""
        let decodedBack = try values.decodeIfPresent(String.self, forKey: .backMarkdown)
        let answer = try values.decodeIfPresent(String.self, forKey: .answerRichText)
        backMarkdown = decodedBack ?? answer ?? ""
        tags = try values.decodeIfPresent([String].self, forKey: .tags) ?? []
        state = try values.decodeIfPresent(String.self, forKey: .state) ?? "new"
        intervalDays = try values.decodeIfPresent(Int.self, forKey: .intervalDays) ?? 0
        easeFactor = try values.decodeIfPresent(Double.self, forKey: .easeFactor) ?? 2.5
        reviewDirection = try values.decodeIfPresent(String.self, forKey: .reviewDirection) ?? "FRONT_TO_BACK"
        version = try values.decodeIfPresent(Int.self, forKey: .version) ?? 1
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(id, forKey: .id)
        try values.encode(deckId, forKey: .deckId)
        try values.encode(type, forKey: .type)
        try values.encode(frontMarkdown, forKey: .frontMarkdown)
        try values.encode(backMarkdown, forKey: .backMarkdown)
        try values.encode(tags, forKey: .tags)
        try values.encode(state, forKey: .state)
        try values.encode(intervalDays, forKey: .intervalDays)
        try values.encode(easeFactor, forKey: .easeFactor)
        try values.encode(reviewDirection, forKey: .reviewDirection)
        try values.encode(version, forKey: .version)
    }

    static func sampleCards(deckId: String) -> [CardModel] {
        [
            CardModel(id: "card-1", deckId: deckId, frontMarkdown: "What is `@Observable` in Swift 5.9+?", backMarkdown: "Macro that replaces `ObservableObject` and `Published`, providing fine-grained tracking per property.", state: "review", intervalDays: 3, easeFactor: 2.5),
            CardModel(id: "card-2", deckId: deckId, frontMarkdown: "What is the purpose of Hexagonal Architecture?", backMarkdown: "Isolate core domain business logic from external frameworks, databases, and UI transport layers via ports and adapters.", state: "learning", intervalDays: 1, easeFactor: 2.3),
            CardModel(id: "card-3", deckId: deckId, frontMarkdown: "Explain the Spaced Repetition SM-2 Algorithm principle.", backMarkdown: "Calculates review interval multiplier based on recall quality grades (0 to 5), optimizing long-term memory retention.", state: "new", intervalDays: 0, easeFactor: 2.5)
        ]
    }
}

struct TrashSnapshotModel: Decodable, Sendable {
    var decks: [DeckModel]
    var cards: [CardModel]
    var tasks: [ProductivityTask]
    var journalEntries: [JournalNoteModel]
    var expenses: [ExpenseModel]
    var gymWorkouts: [WorkoutModel]
    var gymExercises: [ExerciseModel]

    private enum CodingKeys: String, CodingKey {
        case decks, cards, tasks, journalEntries, expenses, gymWorkouts, gymExercises
    }

    init(from decoder: Decoder) throws {
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

struct StudySessionHistoryItem: Identifiable, Codable, Equatable, Sendable {
    let id: String
    let deckId: String?
    let deckTitle: String?
    let mode: String
    let rating: Int?
    let reviewed: Int
    let correct: Int
    let correctRate: Int
    let startedAt: String
    let completedAt: String?
}

struct SessionReviewItem: Codable, Equatable, Sendable {
    let cardId: String
    let direction: String
    let grade: String
    let userAnswer: String?
    let promptRichText: String
    let answerRichText: String
}

struct StudySessionFeedback: Codable, Equatable, Sendable {
    let summary: String
    let nextSteps: [String]
}

struct StudySessionDetails: Codable, Equatable, Sendable {
    let id: String
    let deckId: String?
    let deckTitle: String?
    let mode: String
    let rating: Int?
    let reviewed: Int
    let correct: Int
    let correctRate: Int
    let startedAt: String
    let completedAt: String?
    let reviews: [SessionReviewItem]
    let feedback: StudySessionFeedback?
}
