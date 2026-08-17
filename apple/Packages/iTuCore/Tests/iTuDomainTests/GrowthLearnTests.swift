import XCTest
@testable import iTuDomain

final class GrowthLearnTests: XCTestCase {
    func testGrowthMappingRulesAndRewardMath() {
        let valid = [
            GrowthAttributeMappingDraft(attributeId: "focus", slot: .primary, weight: 70),
            GrowthAttributeMappingDraft(attributeId: "grit", slot: .secondary, weight: 30)
        ]
        XCTAssertTrue(GrowthAttributeMappingRules.validate(valid).valid)
        XCTAssertFalse(GrowthAttributeMappingRules.validate([GrowthAttributeMappingDraft(attributeId: "focus", slot: .primary, weight: 60)]).valid)

        let awards = [
            GrowthEarningRuleSkillAwardDTO(skillId: "b", xpReward: 1, skill: nil),
            GrowthEarningRuleSkillAwardDTO(skillId: "a", xpReward: 2, skill: nil),
            GrowthEarningRuleSkillAwardDTO(skillId: "c", xpReward: 4, skill: nil)
        ]
        XCTAssertEqual(GrowthRewardMath.selectedAwards(awards).map(\.skillId), ["a", "b", "c"])
        XCTAssertEqual(GrowthRewardMath.split(accountXp: 10, awards: awards), [3, 1, 6])
        XCTAssertEqual(GrowthRewardMath.split(accountXp: 10, awards: awards, archivedSkillIDs: ["c"]), [7, 3])
    }

    func testLearnModelsPreserveServerCodableCompatibility() throws {
        let deckData = #"{"id":"deck-1","title":"Swift","studyStats":{"totalCards":12,"dueCount":4,"lastStudiedAt":"2026-01-01T00:00:00Z"},"icon":"BRAIN","color":"TEAL"}"#.data(using: .utf8)!
        let deck = try JSONDecoder().decode(DeckModel.self, from: deckData)
        XCTAssertEqual(deck.cardCount, 12)
        XCTAssertEqual(deck.dueCount, 4)
        XCTAssertEqual(deck.lastReviewedAt, "2026-01-01T00:00:00Z")
        XCTAssertEqual(deck.icon, "brain")
        XCTAssertEqual(deck.color, "teal")

        let cardData = #"{"id":"card-1","deckId":"deck-1","promptRichText":"Question","answerRichText":"Answer"}"#.data(using: .utf8)!
        let card = try JSONDecoder().decode(CardModel.self, from: cardData)
        XCTAssertEqual(card.frontMarkdown, "Question")
        XCTAssertEqual(card.backMarkdown, "Answer")
        XCTAssertEqual(try JSONDecoder().decode(CardModel.self, from: JSONEncoder().encode(card)), card)

        let details = StudySessionDetails(id: "session-1", deckId: deck.id, deckTitle: deck.title, mode: "REVIEW", rating: 5, reviewed: 1, correct: 1, correctRate: 100, startedAt: "2026-01-01T00:00:00Z", completedAt: nil, reviews: [], feedback: StudySessionFeedback(summary: "Good", nextSteps: ["Continue"]))
        XCTAssertEqual(try JSONDecoder().decode(StudySessionDetails.self, from: JSONEncoder().encode(details)), details)
    }
}
