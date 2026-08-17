import XCTest
@testable import iTu
import iTuDomain
import iTuOffline
import iTuSync

@MainActor
final class Phase6LearnJournalMatrixTests: XCTestCase {
    func testLearnStudyMutationsKeepCanonicalKindsAndPayloads() async throws {
        let store = OfflineStore(accountID: "learn", baseURL: temporaryRoot())
        _ = try await store.load()
        let deck = try await store.createDeck(title: "Swift", description: "Syntax")
        let card = try await store.createCard(deckId: deck.deck.id, frontMarkdown: "Front", backMarkdown: "Back")
        let session = try await store.startStudySession(deckId: deck.deck.id)
        _ = try await store.submitReview(sessionId: session.sessionId, cardId: card.card.id, grade: "GOOD")
        let snapshot = try await store.completeStudySession(sessionId: session.sessionId, rating: 8)

        XCTAssertEqual(snapshot.mutations.map(\.kind), ["deck.create", "card.create", "session.start", "review.create", "session.complete"])
        guard let reviewIndex = snapshot.mutations.firstIndex(where: { $0.kind == "review.create" }),
              let completionIndex = snapshot.mutations.firstIndex(where: { $0.kind == "session.complete" }) else {
            return XCTFail("Expected review and completion mutations")
        }
        XCTAssertLessThan(reviewIndex, completionIndex)
        XCTAssertEqual(snapshot.mutations[2].payload["deckId"]?.stringValue, deck.deck.id)
        XCTAssertEqual(snapshot.mutations[3].payload["grade"]?.stringValue, "GOOD")
        XCTAssertEqual(snapshot.mutations[4].payload["rating"]?.numberValue, 8)
    }

    func testJournalCreateUpdateDeleteAndReviewReadOnlyContract() async throws {
        let store = OfflineStore(accountID: "journal", baseURL: temporaryRoot())
        _ = try await store.load()
        let note = JournalNoteModel(
            id: "note", userId: "journal", title: "Idea", contentMarkdown: "Draft",
            entryDate: "2026-08-17", updatedAt: "2026-08-17T10:00:00Z"
        )
        _ = try await store.saveJournalNote(note, mutation: SyncMutation(
            id: "create", kind: "journal.create", entityId: note.id,
            payload: ["id": .string(note.id), "kind": .string("NOTE"), "title": .string(note.title), "contentMarkdown": .string(note.contentMarkdown), "entryDate": .string(note.entryDate), "timezone": .string(note.timezone), "tagIds": .array([])],
            occurredAt: note.updatedAt
        ))
        var updated = note
        updated.contentMarkdown = "Updated"
        updated.version = 2
        _ = try await store.saveJournalNote(updated, mutation: SyncMutation(
            id: "update", kind: "journal.update", entityId: note.id, baseVersion: 1,
            payload: ["contentMarkdown": .string("Updated")], occurredAt: "2026-08-17T10:01:00Z"
        ))
        var deleted = updated
        deleted.deletedAt = "2026-08-17T10:02:00Z"
        deleted.version = 3
        let snapshot = try await store.saveJournalNote(deleted, mutation: SyncMutation(
            id: "delete", kind: "journal.delete", entityId: note.id, baseVersion: 2,
            payload: [:], occurredAt: deleted.deletedAt!
        ))

        XCTAssertEqual(snapshot.mutations.map(\.kind), ["journal.create", "journal.update", "journal.delete"])
        XCTAssertEqual(snapshot.journalNotes.first?.deletedAt, deleted.deletedAt)
        XCTAssertTrue(AppModel.canEditJournalNote(note))
        let review = JournalNoteModel(
            id: "review", userId: "journal", kind: "DAILY_REVIEW", title: "Daily",
            contentMarkdown: "Generated", entryDate: note.entryDate, updatedAt: note.updatedAt,
            dailyReview: JournalDailyReviewModel(entryId: "review", periodDate: note.entryDate, summarySnapshot: [:])
        )
        XCTAssertFalse(AppModel.canEditJournalNote(review))
    }

    func testMobileReviewsSaveOfflineWithMeasuredSnapshots() async {
        let model = AppModel(offlineLocation: OfflineStoreLocation(rootURL: temporaryRoot()))
        let account = UserProfile(id: "reviews", email: nil, username: "reviews", displayName: nil, avatarUrl: nil, roles: [], permissions: [])
        await model.activate(account, reconcileRemote: false)

        let daily = await model.saveDailyReview(
            date: "2026-08-17", wentWell: "Shipped the import", friction: "", learned: "Keep snapshots absolute",
            context: "", summarySnapshot: [
                "health": .object(["steps": .number(8241), "exerciseMinutes": .number(52)])
            ]
        )
        XCTAssertEqual(daily?.kind, "DAILY_REVIEW")
        XCTAssertEqual(daily?.dailyReview?.summarySnapshot["health"]?.objectValue?["steps"]?.numberValue, 8241)

        let weekly = await model.saveWeeklyReview(
            periodStart: "2026-08-17", periodEnd: "2026-08-23", wentWell: "", friction: "", learned: "",
            different: "More focused", nextWeek: "Finish validation", summarySnapshot: [
                "appUsage": .object(["activeSeconds": .number(3600)])
            ]
        )
        XCTAssertEqual(weekly?.kind, "WEEKLY_REVIEW")
        XCTAssertEqual(weekly?.weeklyReview?.periodStart, "2026-08-17")
        XCTAssertEqual(model.pendingMutations.map(\.kind), ["journal.create", "journal.create"])
    }

    func testNotificationPermissionStateOnlySchedulesAfterAuthorization() {
        XCTAssertTrue(IOSNotificationAuthorizationState.notDetermined.canRequest)
        XCTAssertFalse(IOSNotificationAuthorizationState.notDetermined.canSchedule)
        XCTAssertTrue(IOSNotificationAuthorizationState.authorized.canSchedule)
        XCTAssertTrue(IOSNotificationAuthorizationState.provisional.canSchedule)
        XCTAssertFalse(IOSNotificationAuthorizationState.denied.canSchedule)
    }

    func testTaskAndHabitIntentsUseLocalFirstMutations() async throws {
        let model = AppModel(offlineLocation: OfflineStoreLocation(rootURL: temporaryRoot()))
        let account = UserProfile(id: "intents", email: nil, username: "intents", displayName: nil, avatarUrl: nil, roles: [], permissions: [])
        await model.activate(account, reconcileRemote: false)

        try await IOSProductivityIntentExecutor.createTask(title: "Shortcut task")
        guard let task = model.tasks.first else { return XCTFail("Expected task from intent") }
        try await IOSProductivityIntentExecutor.completeTask(id: task.id)
        XCTAssertEqual(model.tasks.first?.status, .completed)

        let habit = HabitModel(id: "habit-intent", name: "Water", targetValue: 2, unit: "glasses")
        let habitSaved = await model.performOfflineMutation { try await $0.saveHabit(habit) }
        XCTAssertTrue(habitSaved)
        try await IOSProductivityIntentExecutor.incrementHabit(id: habit.id)
        try await IOSProductivityIntentExecutor.completeHabit(id: habit.id)

        XCTAssertEqual(model.habitOccurrences.first(where: { $0.habitId == habit.id })?.value, 2)
        XCTAssertTrue(model.pendingMutations.contains { $0.kind == "habitoccurrence.checkin" })
    }

    func testMatrixClassificationAndReassignmentQueueTaskUpdate() async throws {
        let task = ProductivityTask.optimistic(id: "task", title: "Ship", priority: .high, important: true, urgentOverride: true)
        XCTAssertEqual(IOSMatrixQuadrant.classify(task), .q1)

        let root = temporaryRoot()
        let model = AppModel(offlineLocation: OfflineStoreLocation(rootURL: root))
        let account = UserProfile(id: "matrix", email: nil, username: "matrix", displayName: nil, avatarUrl: nil, roles: [], permissions: [])
        await model.activate(account, reconcileRemote: false)
        _ = await model.performOfflineMutation { store in
            let result = try await store.createTask(title: "Move me")
            return result.snapshot
        }
        guard let localTask = model.tasks.first else { return XCTFail("Expected task") }
        await model.reassignTask(localTask, to: .q3)

        let update = model.pendingMutations.last { $0.kind == "task.update" }
        XCTAssertEqual(update?.payload["important"]?.boolValue, false)
        XCTAssertEqual(update?.payload["urgentOverride"]?.boolValue, true)
        XCTAssertEqual(model.tasks.first?.urgentOverride, true)
    }

    func testRefreshSnapshotIsDroppedAfterAccountSwitch() async {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("itu-phase6-refresh-\(UUID().uuidString)", isDirectory: true)
        let model = AppModel(offlineLocation: OfflineStoreLocation(rootURL: root))
        let first = UserProfile(id: "refresh-one", email: nil, username: "one", displayName: nil, avatarUrl: nil, roles: [], permissions: [])
        let second = UserProfile(id: "refresh-two", email: nil, username: "two", displayName: nil, avatarUrl: nil, roles: [], permissions: [])
        let deck = DeckModel(id: "stale-deck", title: "Stale", description: "", cardCount: 0, dueCount: 0, color: "teal", icon: "book.closed")

        await model.activate(first, reconcileRemote: false)
        let refresh = Task { @MainActor in
            await model.performOfflineMutation { store in
                try await Task.sleep(for: .milliseconds(40))
                return try await store.updateDecks([deck])
            }
        }
        await Task.yield()
        await model.activate(second, reconcileRemote: false)

        let applied = await refresh.value
        XCTAssertFalse(applied)
        XCTAssertEqual(model.user?.id, second.id)
        XCTAssertTrue(model.decks.isEmpty)
    }

    private func temporaryRoot() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("itu-phase6-\(UUID().uuidString)", isDirectory: true)
    }
}
