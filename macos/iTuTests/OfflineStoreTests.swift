import XCTest
@testable import iTu

final class OfflineStoreTests: XCTestCase {
    private var temporaryDirectory: URL!

    override func setUpWithError() throws {
        temporaryDirectory = FileManager.default
            .urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try FileManager.default.removeItem(at: temporaryDirectory)
    }

    func testCreateTaskPersistsTaskAndMutationTogether() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()

        let (_, snapshot) = try await store.createTask(title: "Write offline first", priority: .high)
        let reloadedStore = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        let reloaded = try await reloadedStore.load()

        XCTAssertEqual(snapshot.tasks.count, 1)
        XCTAssertEqual(snapshot.mutations.count, 1)
        XCTAssertEqual(reloaded.tasks.first?.title, "Write offline first")
        XCTAssertEqual(reloaded.mutations.first?.kind, "task.create")
        XCTAssertEqual(reloaded.mutations.first?.entityId, reloaded.tasks.first?.id)
    }

    func testLearnDeckCardsAndReviewMutationsPersistOfflineFirst() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()

        let created = try await store.createDeck(title: "Swift", description: "Concurrency")
        let card = CardModel(
            id: "card-1",
            deckId: created.deck.id,
            frontMarkdown: "Question",
            backMarkdown: "Answer",
            state: "review",
            intervalDays: 1,
            easeFactor: 2.5
        )
        var snapshot = try await store.updateCards(deckId: created.deck.id, cards: [card])
        let session = try await store.startStudySession(deckId: created.deck.id)
        snapshot = try await store.submitReview(sessionId: session.sessionId, cardId: card.id, grade: "GOOD")
        snapshot = try await store.completeStudySession(sessionId: session.sessionId, rating: 8)

        XCTAssertEqual(snapshot.cardsByDeckId[created.deck.id]?.first?.frontMarkdown, "Question")
        XCTAssertEqual(snapshot.decks.first?.cardCount, 1)
        XCTAssertEqual(snapshot.mutations.map(\.kind), ["deck.create", "session.start", "review.create", "session.complete"])
        XCTAssertEqual(snapshot.mutations[2].payload["cardId"]?.stringValue, card.id)
    }

    func testTrashSnapshotDecodesDecksAndCards() throws {
        let json = """
        {"decks":[{"id":"deck-trash","title":"Archived deck","description":"Old cards","cardCount":1,"dueCount":0,"icon":"BOOK","color":"TEAL","version":3}],"cards":[{"id":"card-trash","deckId":"deck-trash","type":"BASIC","promptRichText":"Prompt","answerRichText":"Answer","tags":[],"state":"new","intervalDays":0,"easeFactor":2.5,"version":4}],"tasks":[]}
        """.data(using: .utf8)!

        let snapshot = try JSONDecoder().decode(TrashSnapshotModel.self, from: json)

        XCTAssertEqual(snapshot.decks.first?.title, "Archived deck")
        XCTAssertEqual(snapshot.cards.first?.frontMarkdown, "Prompt")
        XCTAssertEqual(snapshot.cards.first?.version, 4)
        XCTAssertTrue(snapshot.tasks.isEmpty)
    }

    func testServerTrashRowsPersistAcrossRestartAndRestoreQueuesMutation() async throws {
        let json = """
        {"decks":[],"cards":[],"tasks":[],"journalEntries":[],"budgetTransactions":[{"id":"transaction-trash","userId":"user-1","type":"EXPENSE","amount":"12.50","currency":"VND","category":"Food","categoryId":"category-1","merchant":"Cafe","paymentMethod":"CASH","transactionAt":"2026-08-01T10:00:00Z","note":null,"version":3,"createdAt":"2026-08-01T09:00:00Z","updatedAt":"2026-08-01T10:00:00Z","deletedAt":"2026-08-01T10:00:00Z","deletedByDeviceId":"device-1"}],"gymWorkouts":[],"gymExercises":[]}
        """.data(using: .utf8)!
        let trash = try JSONDecoder().decode(TrashSnapshotModel.self, from: json)
        let store = OfflineStore(accountID: "trash-cache-user", baseURL: temporaryDirectory)
        _ = try await store.load()

        let cached = try await store.cacheTrashItems(trash)
        XCTAssertEqual(cached.budgetTransactions.first?.deletedAt, "2026-08-01T10:00:00Z")
        XCTAssertEqual(cached.budgetTransactions.first?.deletedByDeviceId, "device-1")

        let reloadedStore = OfflineStore(accountID: "trash-cache-user", baseURL: temporaryDirectory)
        let reloaded = try await reloadedStore.load()
        let deleted = try XCTUnwrap(reloaded.budgetTransactions.first)
        XCTAssertEqual(reloaded.budgetTransactions.filter { $0.deletedAt != nil }.map(\.id), ["transaction-trash"])
        let restored = BudgetTransactionModel(id: deleted.id, userId: deleted.userId, type: deleted.type, amount: deleted.amount, currency: deleted.currency, category: deleted.category, categoryId: deleted.categoryId, merchant: deleted.merchant, paymentMethod: deleted.paymentMethod, transactionAt: deleted.transactionAt, note: deleted.note, version: (deleted.version ?? 1) + 1, createdAt: deleted.createdAt, updatedAt: "2026-08-01T11:00:00Z", deletedAt: nil, deletedByDeviceId: nil)
        let restoredSnapshot = try await reloadedStore.saveBudgetTransaction(restored, mutation: SyncMutation(id: "restore-1", kind: "budgettransaction.restore", entityId: restored.id, baseVersion: deleted.version, payload: ["deletedAt": .null], occurredAt: "2026-08-01T11:00:00Z"))

        XCTAssertNil(restoredSnapshot.budgetTransactions.first?.deletedAt)
        XCTAssertEqual(restoredSnapshot.mutations.last?.kind, "budgettransaction.restore")
        let restartedAgain = OfflineStore(accountID: "trash-cache-user", baseURL: temporaryDirectory)
        let finalSnapshot = try await restartedAgain.load()
        XCTAssertNil(finalSnapshot.budgetTransactions.first?.deletedAt)
        XCTAssertEqual(finalSnapshot.mutations.last?.kind, "budgettransaction.restore")
    }

    func testTrashFilterEmptyCopyUsesCanonicalFilterName() {
        XCTAssertEqual(TrashFilter.all.emptyMessage, "Trash is empty")
        XCTAssertEqual(TrashFilter.journal.emptyMessage, "No deleted journal")
        XCTAssertEqual(TrashFilter.budget.emptyMessage, "No deleted budget")
        XCTAssertEqual(TrashFilter.gym.emptyMessage, "No deleted gym")
    }

    @MainActor
    func testTrashUsesServerTaskSnapshotWhenDeletedTaskIsNotInLocalActiveTasks() throws {
        let json = """
        {"decks":[],"cards":[],"tasks":[{"id":"task-trash","taskListId":null,"projectId":null,"sectionId":null,"parentId":null,"title":"Deleted task","descriptionMarkdown":"","priority":"HIGH","important":false,"urgentOverride":null,"urgent":false,"urgencyReason":"","scheduledStartAt":null,"scheduledEndAt":null,"dueAt":null,"estimatedMinutes":null,"recurrenceRule":null,"reminders":[],"status":"INBOX","sortOrder":1,"completedAt":null,"deletedAt":"2026-08-01T10:00:00Z","createdAt":"2026-08-01T09:00:00Z","updatedAt":"2026-08-01T10:00:00Z","version":1}]}
        """.data(using: .utf8)!

        let model = AppModel()
        model.tasks = []
        model.trashSnapshot = try JSONDecoder().decode(TrashSnapshotModel.self, from: json)

        XCTAssertEqual(model.trashedTasks.map(\.title), ["Deleted task"])
    }

    func testLearnTrashRestoreUsesOfflineSyncMutations() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let deck = try await store.createDeck(title: "Archived", description: "Restore me").deck
        let card = CardModel(
            id: "card-restore",
            deckId: deck.id,
            frontMarkdown: "Prompt",
            backMarkdown: "Answer",
            state: "new",
            intervalDays: 0,
            easeFactor: 2.5
        )

        _ = try await store.updateCards(deckId: deck.id, cards: [card])
        let restoredDeck = try await store.restoreDeck(deck)
        let restoredCard = try await store.restoreCard(card)

        XCTAssertEqual(restoredDeck.mutations.map(\.kind).last, "deck.restore")
        XCTAssertEqual(restoredCard.mutations.map(\.kind).last, "card.restore")
        XCTAssertEqual(restoredCard.cardsByDeckId[deck.id]?.first?.id, card.id)
    }

    func testLearnDeckArchiveRemovesCachedDeckAndQueuesDelete() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let created = try await store.createDeck(title: "Archive me", description: "Deck")
        let card = CardModel(
            id: "card-archive",
            deckId: created.deck.id,
            frontMarkdown: "Prompt",
            backMarkdown: "Answer",
            state: "new",
            intervalDays: 0,
            easeFactor: 2.5
        )
        _ = try await store.updateCards(deckId: created.deck.id, cards: [card])

        let archived = try await store.deleteDeck(id: created.deck.id)

        XCTAssertFalse(archived.decks.contains(where: { $0.id == created.deck.id }))
        XCTAssertNil(archived.cardsByDeckId[created.deck.id])
        XCTAssertEqual(archived.mutations.last?.kind, "deck.delete")
    }

    func testHydrationKeepsPendingDeckDeleteAppliedToServerSnapshot() async throws {
        let store = OfflineStore(accountID: "hydration-deck-delete-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let created = try await store.createDeck(title: "Archive me", description: "Deck")
        _ = try await store.deleteDeck(id: created.deck.id)

        let hydrated = try await store.applyHydration(
            hydrationResources(decks: [created.deck])
        )

        XCTAssertFalse(hydrated.decks.contains(where: { $0.id == created.deck.id }))
    }

    func testStudyHistoryAndDetailsDecodeWebContracts() throws {
        let historyJSON = """
        {"id":"session-1","deckId":"deck-1","deckTitle":"Swift","mode":"DUE","rating":8,"reviewed":4,"correct":3,"correctRate":75,"startedAt":"2026-08-01T10:00:00Z","completedAt":"2026-08-01T10:05:00Z"}
        """.data(using: .utf8)!
        let history = try JSONDecoder().decode(StudySessionHistoryItem.self, from: historyJSON)
        XCTAssertEqual(history.deckTitle, "Swift")
        XCTAssertEqual(history.correctRate, 75)

        let detailsJSON = """
        {"id":"session-1","deckId":"deck-1","deckTitle":"Swift","mode":"DUE","rating":8,"reviewed":1,"correct":1,"correctRate":100,"startedAt":"2026-08-01T10:00:00Z","completedAt":"2026-08-01T10:05:00Z","reviews":[{"cardId":"card-1","direction":"FRONT_TO_BACK","grade":"EASY","userAnswer":"answer","promptRichText":"Prompt","answerRichText":"Answer"}],"feedback":{"summary":"Keep reviewing.","nextSteps":["Review tomorrow"]}}
        """.data(using: .utf8)!
        let details = try JSONDecoder().decode(StudySessionDetails.self, from: detailsJSON)
        XCTAssertEqual(details.reviews.first?.grade, "EASY")
        XCTAssertEqual(details.feedback?.nextSteps, ["Review tomorrow"])
    }

    func testStatisticsContractsDecodeCalendarAndGrowthTrend() throws {
        let calendarJSON = """
        [{"date":"2026-08-01","sessions":2,"focusSessions":1,"reviews":6,"correct":5,"completedTasks":3,"focusedMinutes":42,"cardsCreated":1}]
        """.data(using: .utf8)!
        let calendar = try JSONDecoder().decode([StudyCalendarDayDTO].self, from: calendarJSON)
        XCTAssertEqual(calendar.first?.completedTasks, 3)
        XCTAssertEqual(calendar.first?.focusedMinutes, 42)

        let growthJSON = """
        {"totalXp":120,"trend":[{"date":"2026-08-01","xp":120}],"attributes":[{"skillId":"attr-1","name":"Focus","icon":"brain","color":"#0f766e","gained":120,"lost":0,"net":120,"changes":2}]}
        """.data(using: .utf8)!
        let growth = try JSONDecoder().decode(GrowthStatisticsDTO.self, from: growthJSON)
        XCTAssertEqual(growth.totalXp, 120)
        XCTAssertEqual(growth.attributes.first?.name, "Focus")
    }

    func testNotificationContractDecodesReadStateAndReminderMetadata() throws {
        let json = """
        {"id":"notification-1","reminderId":"reminder-1","title":"Plan review","body":"Your task is due soon.","actionUrl":"/plan/today","readAt":null,"createdAt":"2026-08-01T10:00:00Z"}
        """.data(using: .utf8)!
        let notification = try JSONDecoder().decode(AppNotificationModel.self, from: json)
        XCTAssertEqual(notification.reminderId, "reminder-1")
        XCTAssertNil(notification.readAt)
        XCTAssertEqual(notification.actionUrl, "/plan/today")

        let reminderJSON = """
        {"id":"reminder-1","remindAt":"2026-08-01T11:00:00Z","status":"SCHEDULED","persistent":false}
        """.data(using: .utf8)!
        let reminder = try JSONDecoder().decode(TaskReminderModel.self, from: reminderJSON)
        XCTAssertEqual(reminder.status, "SCHEDULED")
        XCTAssertFalse(reminder.persistent)
    }

    func testNotificationActionURLsRouteToNativeSections() async {
        let today = await MainActor.run { AppModel.notificationDestination(for: "/plan/today") }
        let learn = await MainActor.run { AppModel.notificationDestination(for: "/learn/review?deckId=deck-1") }
        let growth = await MainActor.run { AppModel.notificationDestination(for: "/growth/skills") }
        let unsupported = await MainActor.run { AppModel.notificationDestination(for: "/unsupported/path") }

        XCTAssertEqual(today, .today)
        XCTAssertEqual(learn, .learn)
        XCTAssertEqual(growth, .growth)
        XCTAssertNil(unsupported)
    }

    func testLearnCardCrudUsesSyncOutboxAndPersistsOptimisticState() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let deck = try await store.createDeck(title: "Deck", description: "Cards").deck

        let created = try await store.createCard(deckId: deck.id, frontMarkdown: "Front", backMarkdown: "Back")
        let card = try XCTUnwrap(created.snapshot.cardsByDeckId[deck.id]?.first)
        let updated = try await store.updateCard(id: card.id, frontMarkdown: "Updated front", backMarkdown: "Updated back")
        let deleted = try await store.deleteCard(id: card.id)

        XCTAssertTrue(deleted.cardsByDeckId[deck.id, default: []].isEmpty)
        XCTAssertEqual(updated.cardsByDeckId[deck.id]?.first?.frontMarkdown, "Updated front")
        XCTAssertEqual(deleted.mutations.map(\.kind), ["deck.create", "card.create", "card.update", "card.delete"])
        XCTAssertEqual(deleted.mutations.last?.baseVersion, 2)
    }

    func testTaskListCrudUsesSyncOutboxAndPersistsOptimisticState() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()

        let created = try await store.createTaskList(
            name: "Work",
            description: "Projects",
            color: "BLUE"
        )
        XCTAssertEqual(created.snapshot.taskLists.first?.name, "Work")

        let updated = try await store.updateTaskList(
            id: created.list.id,
            name: "Client Work",
            description: "Active projects",
            color: "PURPLE"
        )
        XCTAssertEqual(updated.taskLists.first?.name, "Client Work")

        let deleted = try await store.deleteTaskList(id: created.list.id)
        XCTAssertTrue(deleted.taskLists.isEmpty)
        XCTAssertEqual(
            deleted.mutations.map(\.kind),
            ["tasklist.create", "tasklist.update", "tasklist.delete"]
        )
        XCTAssertEqual(deleted.mutations.last?.baseVersion, 2)
    }

    func testAcknowledgementAndPullAreCommittedTogether() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let (_, local) = try await store.createTask(title: "Local")
        let mutationID = try XCTUnwrap(local.mutations.first?.id)
        let task = try XCTUnwrap(local.tasks.first)
        var serverTask = task
        serverTask.urgencyReason = ""
        serverTask.version = 2
        let resourceData = try JSONEncoder().encode(serverTask)
        let resource = try JSONDecoder().decode(JSONValue.self, from: resourceData)

        let result = try await store.applySync(
            acknowledgedMutationIds: [mutationID],
            conflicts: [],
            changes: [
                SyncChange(
                    cursor: 42,
                    entityType: "task",
                    entityId: task.id,
                    deleted: false,
                    data: resource,
                    complete: true
                )
            ],
            cursor: "42",
            lastSyncTime: "2026-07-31T00:00:00.000Z"
        )

        XCTAssertEqual(result.cursor, "42")
        XCTAssertTrue(result.mutations.isEmpty)
        XCTAssertEqual(result.tasks.first?.version, 2)
    }

    func testTaskEditsPersistOptimisticallyWithConflictBaseValues() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let (_, created) = try await store.createTask(title: "Original")
        let task = try XCTUnwrap(created.tasks.first)

        let edited = try await store.editTask(
            id: task.id,
            edits: TaskEdits(
                title: "Revised",
                descriptionMarkdown: "Saved before sync",
                priority: .high,
                important: true,
                dueAt: nil,
                estimatedMinutes: 30,
                scheduledStartAt: "2026-08-01T09:00:00Z",
                scheduledEndAt: "2026-08-01T09:30:00Z",
                recurrenceRule: "FREQ=WEEKLY"
            )
        )
        let update = try XCTUnwrap(edited.mutations.last)

        XCTAssertEqual(edited.tasks.first?.title, "Revised")
        XCTAssertEqual(edited.tasks.first?.estimatedMinutes, 30)
        XCTAssertEqual(edited.tasks.first?.scheduledStartAt, "2026-08-01T09:00:00Z")
        XCTAssertEqual(edited.tasks.first?.recurrenceRule, "FREQ=WEEKLY")
        XCTAssertEqual(update.kind, "task.update")
        XCTAssertEqual(update.baseVersion, 1)
        XCTAssertEqual(update.baseValues?["title"]?.stringValue, "Original")
        XCTAssertEqual(update.payload["title"]?.stringValue, "Revised")
        XCTAssertEqual(update.payload["scheduledEndAt"]?.stringValue, "2026-08-01T09:30:00Z")
    }

    func testScheduleEditsCarryFieldClocksAndCoalesce() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let (task, created) = try await store.createTask(title: "Scheduled task")
        _ = created
        _ = try await store.editTask(
            id: task.id,
            edits: TaskEdits(
                title: task.title,
                descriptionMarkdown: task.descriptionMarkdown,
                priority: task.priority,
                important: task.important,
                dueAt: task.dueAt,
                estimatedMinutes: task.estimatedMinutes,
                scheduledStartAt: "2026-08-01T09:00:00Z",
                scheduledEndAt: "2026-08-01T10:00:00Z"
            )
        )
        let second = try await store.editTask(
            id: task.id,
            edits: TaskEdits(
                title: task.title,
                descriptionMarkdown: task.descriptionMarkdown,
                priority: task.priority,
                important: task.important,
                dueAt: task.dueAt,
                estimatedMinutes: task.estimatedMinutes,
                scheduledStartAt: "2026-08-01T08:30:00Z",
                scheduledEndAt: "2026-08-01T11:00:00Z"
            )
        )

        let scheduleUpdates = second.mutations.filter { $0.kind == "task.update" && $0.payload["scheduledStartAt"] != nil }
        XCTAssertEqual(scheduleUpdates.count, 1)
        let mutation = try XCTUnwrap(scheduleUpdates.first)
        XCTAssertEqual(mutation.payload["scheduledStartAt"]?.stringValue, "2026-08-01T08:30:00Z")
        XCTAssertEqual(mutation.payload["scheduledEndAt"]?.stringValue, "2026-08-01T11:00:00Z")
        XCTAssertTrue(mutation.baseValues?["scheduledStartAt"] == .null)
        XCTAssertEqual(mutation.fieldEditedAt?["scheduledStartAt"], mutation.fieldEditedAt?["scheduledEndAt"])
        XCTAssertNotNil(mutation.fieldEditedAt?["scheduledStartAt"])
    }

    func testTaskMetadataAssignmentPersistsSectionAndTagsInUpdateMutation() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let (_, created) = try await store.createTask(title: "Tagged task")
        let task = try XCTUnwrap(created.tasks.first)

        _ = try await store.updateTaskMetadata([
            TaskMetadataDTO(
                id: task.id,
                sectionId: "section-1",
                tags: [TaskTagAssignmentDTO(tag: TaskTagDTO(id: "tag-old"))]
            )
        ])
        let updated = try await store.editTask(
            id: task.id,
            edits: TaskEdits(
                title: task.title,
                descriptionMarkdown: task.descriptionMarkdown,
                priority: task.priority,
                important: task.important,
                dueAt: task.dueAt,
                estimatedMinutes: task.estimatedMinutes,
                sectionId: "section-2",
                tagIds: ["tag-new"]
            )
        )

        let mutation = try XCTUnwrap(updated.mutations.last)
        XCTAssertEqual(updated.tasks.first?.sectionId, "section-2")
        XCTAssertEqual(updated.tagIdsByTaskID[task.id], ["tag-new"])
        XCTAssertEqual(mutation.payload["sectionId"]?.stringValue, "section-2")
        XCTAssertEqual(mutation.payload["tagIds"], .array([.string("tag-new")]))
    }

    func testKeepConflictRebasesLocalDraftOnServerVersion() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let (task, created) = try await store.createTask(title: "Original")
        let createMutationID = try XCTUnwrap(created.mutations.first?.id)
        _ = try await store.editTask(
            id: task.id,
            edits: TaskEdits(
                title: "Local revision",
                descriptionMarkdown: task.descriptionMarkdown,
                priority: task.priority,
                important: task.important,
                dueAt: task.dueAt,
                estimatedMinutes: task.estimatedMinutes
            )
        )

        let pendingSnapshot = try await store.snapshot()
        let conflict = SyncConflict(
            mutationId: try XCTUnwrap(pendingSnapshot.mutations.last?.id),
            entityType: "task",
            entityId: task.id,
            reason: "VERSION_CONFLICT",
            serverData: .object([
                "version": .number(4),
                "title": .string("Server revision")
            ]),
            localDraft: ["title": .string("Local revision")],
            conflictingFields: ["title"],
            kind: "task.update",
            occurredAt: nil
        )
        let conflicted = try await store.applySync(
            acknowledgedMutationIds: [createMutationID],
            conflicts: [conflict],
            changes: [],
            cursor: "4"
        )
        let savedConflict = try XCTUnwrap(conflicted.conflicts.first)

        let rebased = try await store.keepConflict(savedConflict)
        let mutation = try XCTUnwrap(rebased.mutations.last)
        XCTAssertTrue(rebased.conflicts.isEmpty)
        XCTAssertEqual(mutation.baseVersion, 4)
        XCTAssertEqual(mutation.baseValues?["title"]?.stringValue, "Server revision")
        XCTAssertEqual(mutation.payload["title"]?.stringValue, "Local revision")
    }

    func testCreateTaskWithSubtaskAndParentIdPersistsCorrectly() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()

        let (parent, _) = try await store.createTask(title: "Parent Task", priority: .medium)
        let (subtask, snapshot2) = try await store.createTask(
            title: "Subtask 1",
            descriptionMarkdown: "Subtask details",
            priority: .low,
            parentId: parent.id
        )

        XCTAssertEqual(snapshot2.tasks.count, 2)
        XCTAssertEqual(subtask.parentId, parent.id)
        XCTAssertEqual(subtask.descriptionMarkdown, "Subtask details")

        let mutation = try XCTUnwrap(snapshot2.mutations.last)
        XCTAssertEqual(mutation.kind, "task.create")
        XCTAssertEqual(mutation.payload["parentId"]?.stringValue, parent.id)
        XCTAssertEqual(mutation.payload["descriptionMarkdown"]?.stringValue, "Subtask details")
    }

    func testCreateTaskPersistsMatrixPresetAtomically() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()

        let (task, snapshot) = try await store.createTask(
            title: "Delegate this",
            important: false,
            urgentOverride: true
        )

        XCTAssertFalse(task.important)
        XCTAssertEqual(task.urgentOverride, true)
        XCTAssertEqual(snapshot.mutations.count, 1)
        XCTAssertEqual(snapshot.mutations.first?.payload["important"], .bool(false))
        XCTAssertEqual(snapshot.mutations.first?.payload["urgentOverride"], .bool(true))
    }

    func testCreateTaskPersistsTaskListAssignment() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()

        let (_, snapshot) = try await store.createTask(title: "List task", taskListId: "list-1")

        XCTAssertEqual(snapshot.tasks.first?.taskListId, "list-1")
        XCTAssertEqual(snapshot.mutations.first?.payload["taskListId"], .string("list-1"))
    }

    func testHabitOccurrenceLocalDayStringTimezoneConversion() {
        let utcOccurrence = HabitOccurrenceModel(
            id: "occ-utc",
            habitId: "habit-1",
            occurrenceDate: "2026-08-02T17:00:00.000Z"
        )
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = TimeZone.current
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let expectedDate = formatter.string(from: isoFormatter.date(from: "2026-08-02T17:00:00.000Z")!)
        XCTAssertEqual(utcOccurrence.localDayString, expectedDate)

        let plainOccurrence = HabitOccurrenceModel(
            id: "occ-plain",
            habitId: "habit-1",
            occurrenceDate: "2026-08-03"
        )
        XCTAssertEqual(plainOccurrence.localDayString, "2026-08-03")
    }

    func testHabitOccurrenceActionsPersistOptimistically() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let occurrence = HabitOccurrenceModel(
            id: "occurrence-1",
            habitId: "habit-1",
            occurrenceDate: "2026-08-01T00:00:00.000Z"
        )
        _ = try await store.updateHabitOccurrences([occurrence])

        let checkedIn = try await store.checkInHabitOccurrence(id: occurrence.id, value: 1)
        XCTAssertEqual(checkedIn.habitOccurrences.first?.status, .completed)
        XCTAssertEqual(checkedIn.mutations.last?.kind, "habitoccurrence.checkin")
        XCTAssertEqual(checkedIn.mutations.last?.payload["value"], .number(1))

        let undone = try await store.habitOccurrenceAction(id: occurrence.id, action: "undo")
        XCTAssertEqual(undone.habitOccurrences.first?.status, .pending)
        XCTAssertEqual(undone.mutations.last?.kind, "habitoccurrence.action")
        XCTAssertEqual(undone.mutations.last?.payload["action"], .string("undo"))
    }

    func testCheckInHabitDateCreatesOccurrenceOnDemand() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let habit = HabitModel(
            id: "habit-on-demand",
            name: "Water Plants",
            targetValue: 1
        )
        _ = try await store.saveHabit(habit)

        let snapshot = try await store.checkInHabitDate(habitId: habit.id, date: "2026-08-04", value: 1)
        let created = snapshot.habitOccurrences.first(where: { $0.habitId == habit.id && $0.localDayString == "2026-08-04" })
        XCTAssertNotNil(created)
        XCTAssertEqual(created?.status, .completed)
        XCTAssertEqual(snapshot.mutations.last?.kind, "habitoccurrence.checkin")
    }

    func testHabitOccurrenceRangeRefreshRemovesOnlyStaleRowsInsideRequestedRange() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let staleInRange = HabitOccurrenceModel(
            id: "stale-in-range",
            habitId: "habit-1",
            occurrenceDate: "2026-08-01T00:00:00.000Z"
        )
        let outsideRange = HabitOccurrenceModel(
            id: "outside-range",
            habitId: "habit-1",
            occurrenceDate: "2026-07-24T00:00:00.000Z"
        )
        _ = try await store.updateHabitOccurrences([staleInRange, outsideRange])

        let refreshed = try await store.updateHabitOccurrences(
            [],
            from: "2026-07-26",
            to: "2026-08-01"
        )

        XCTAssertFalse(refreshed.habitOccurrences.contains { $0.id == staleInRange.id })
        XCTAssertTrue(refreshed.habitOccurrences.contains { $0.id == outsideRange.id })
    }

    func testHabitOccurrenceRangeRefreshPreservesPendingOptimisticMutation() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let occurrence = HabitOccurrenceModel(
            id: "pending-occurrence",
            habitId: "habit-1",
            occurrenceDate: "2026-08-01T00:00:00.000Z"
        )
        _ = try await store.updateHabitOccurrences([occurrence])
        _ = try await store.habitOccurrenceAction(id: occurrence.id, action: "skip")

        let refreshed = try await store.updateHabitOccurrences(
            [occurrence],
            from: "2026-07-26",
            to: "2026-08-01"
        )

        XCTAssertEqual(refreshed.habitOccurrences.first { $0.id == occurrence.id }?.status, .skipped)
    }

    func testHabitManagementPersistsTargetsDirectionScheduleAndArchive() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let habit = HabitModel(
            id: "habit-1",
            name: "Read",
            targetValue: 20,
            targetType: "COUNT",
            unit: "pages",
            targetDaysPerWeek: 5,
            direction: .build,
            scheduleType: "TIMES_PER_PERIOD",
            weekdays: [],
            timesPerPeriod: 3,
            period: "WEEK",
            startDate: "2026-08-01T00:00:00.000Z"
        )
        let created = try await store.saveHabit(habit)
        let createMutation = try XCTUnwrap(created.mutations.last)
        XCTAssertEqual(createMutation.kind, "habit.create")
        XCTAssertEqual(createMutation.payload["targetValue"], .number(20))
        XCTAssertEqual(createMutation.payload["scheduleType"], .string("TIMES_PER_PERIOD"))
        XCTAssertEqual(createMutation.payload["timesPerPeriod"], .number(3))
        XCTAssertEqual(createMutation.payload["period"], .string("WEEK"))
        XCTAssertEqual(createMutation.payload["startDate"], .string("2026-08-01T00:00:00.000Z"))

        var archived = habit
        archived.archivedAt = "2026-08-01T00:00:00.000Z"
        let updated = try await store.saveHabit(archived)
        let updateMutation = try XCTUnwrap(updated.mutations.last)
        XCTAssertEqual(updateMutation.kind, "habit.update")
        XCTAssertEqual(updateMutation.baseVersion, 1)
        XCTAssertEqual(updateMutation.payload["archived"], .bool(true))
    }

    func testGrowthSkillEditPersistsThroughSyncOutbox() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let skill = SkillNode(
            id: "skill-1",
            name: "Focus",
            description: "Original",
            level: 1,
            maxLevel: 5,
            icon: "timer",
            category: "Focus"
        )
        _ = try await store.updateGrowthOverview(GrowthOverviewDTO(
            account: nil,
            skills: [GrowthSkillDTO(id: skill.id, key: nil, name: skill.name, level: skill.level, maxLevel: skill.maxLevel, currentXp: nil, nextLevelXp: nil, category: skill.category, description: skill.description, icon: skill.icon, color: nil, baseXp: nil, version: nil)],
            recentLedger: nil
        ))
        let updated = try await store.updateSkill(id: skill.id, name: "Deep Focus", description: "Updated", icon: "scope")
        XCTAssertEqual(updated.skills.first?.name, "Deep Focus")
        XCTAssertEqual(updated.mutations.last?.kind, "growthskill.update")
        XCTAssertEqual(updated.mutations.last?.payload["description"], .string("Updated"))
    }

    func testGrowthSkillRetainsBaseXPForLocalProgressMath() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()

        let snapshot = try await store.updateGrowthOverview(GrowthOverviewDTO(
            account: nil,
            skills: [GrowthSkillDTO(
                id: "skill-base",
                key: "skill-base",
                name: "Deep Focus",
                level: 2,
                maxLevel: 5,
                currentXp: 150,
                nextLevelXp: 400,
                category: "Focus",
                description: nil,
                icon: "timer",
                color: nil,
                baseXp: 75,
                version: 1
            )],
            recentLedger: nil
        ))

        XCTAssertEqual(snapshot.skills.first?.baseXp, 75)
    }

    func testGrowthAttributesKeepTotalAndLevelRelativeXP() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()

        let snapshot = try await store.updateGrowthAttributes([
            GrowthSkillDTO(
                id: "attribute-1",
                key: nil,
                name: "Focus",
                level: 2,
                maxLevel: nil,
                currentXp: 250,
                nextLevelXp: 400,
                levelStartXp: 100,
                progressXp: 150,
                requiredXp: 300,
                category: nil,
                description: nil,
                icon: "BRAIN",
                color: "TEAL",
                baseXp: 100,
                version: 1
            )
        ])

        XCTAssertEqual(snapshot.attributes.first?.currentXP, 250)
        XCTAssertEqual(snapshot.attributes.first?.nextLevelXP, 400)
        XCTAssertEqual(snapshot.attributes.first?.progressXP, 150)
        XCTAssertEqual(snapshot.attributes.first?.requiredXP, 300)
    }

    func testGrowthOverviewKeepsLevelRelativeAccountXP() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()

        let snapshot = try await store.updateGrowthOverview(
            GrowthOverviewDTO(
                account: GrowthAccountDTO(
                    level: 2,
                    currentXp: 250,
                    nextLevelXp: 400,
                    coinBalance: 10,
                    levelStartXp: 100,
                    progressXp: 150,
                    requiredXp: 300,
                    baseXp: 100
                ),
                skills: nil,
                recentLedger: nil
            )
        )

        XCTAssertEqual(snapshot.growthCurrentXp, 250)
        XCTAssertEqual(snapshot.growthNextLevelXp, 400)
        XCTAssertEqual(snapshot.growthProgressXp, 150)
        XCTAssertEqual(snapshot.growthRequiredXp, 300)
    }

    func testGrowthProfileSettingsPersistAndReapplyOfflineMutation() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let profile = GrowthProfileDTO(
            id: "profile-1",
            userId: "test-user",
            accountBaseXp: 100,
            activeCycleId: "cycle-1",
            onboardingState: "COMPLETED",
            rewardPreset: .standard,
            createdAt: "2026-08-01T00:00:00Z",
            updatedAt: "2026-08-01T00:00:00Z"
        )

        _ = try await store.updateGrowthProfile(profile)
        let updated = try await store.updateGrowthProfile(accountBaseXp: 240, rewardPreset: .strong)
        let mutation = try XCTUnwrap(updated.mutations.last)

        XCTAssertEqual(updated.growthProfile?.accountBaseXp, 240)
        XCTAssertEqual(updated.growthProfile?.rewardPreset, .strong)
        XCTAssertEqual(mutation.kind, "growthprofile.update")
        XCTAssertEqual(mutation.payload["accountBaseXp"], .number(240))
        XCTAssertEqual(mutation.payload["rewardPreset"], .string("STRONG"))

        let reloadedStore = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        let reloaded = try await reloadedStore.load()
        XCTAssertEqual(reloaded.growthProfile?.accountBaseXp, 240)
        XCTAssertEqual(reloaded.growthProfile?.rewardPreset, .strong)
    }

    func testGrowthResetPreviewDecodesWebContract() throws {
        let json = """
        {"scope":"FULL","affectedSkills":[{"id":"skill-1","name":"Focus","xpToReset":240,"currentLevel":3,"newLevel":1}],"coinBalanceToReset":80}
        """.data(using: .utf8)!

        let preview = try JSONDecoder().decode(GrowthResetPreviewDTO.self, from: json)
        XCTAssertEqual(preview.scope, .full)
        XCTAssertEqual(preview.affectedSkills.first?.newLevel, 1)
        XCTAssertEqual(preview.coinBalanceToReset, 80)
    }

    func testGrowthRewardPresetEditsAndApplyUseSyncOutbox() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let profile = GrowthProfileDTO(
            id: "profile-1",
            userId: "test-user",
            accountBaseXp: 100,
            activeCycleId: "cycle-1",
            onboardingState: "COMPLETED",
            rewardPreset: .standard,
            createdAt: "2026-08-01T00:00:00Z",
            updatedAt: "2026-08-01T00:00:00Z"
        )
        _ = try await store.updateGrowthProfile(profile)
        _ = try await store.updateGrowthRewardPresetSettings([
            "STANDARD": ["TASK": GrowthRewardRuleDTO(coinReward: 3, xpRewardPerSkill: 15, scalingMode: .fixed, maxRewardCap: nil)]
        ])

        let edited = try await store.updateGrowthRewardPreset(
            preset: .standard,
            rules: ["TASK": GrowthRewardRuleDTO(coinReward: 7, xpRewardPerSkill: 25, scalingMode: .linear, maxRewardCap: 100)]
        )
        XCTAssertEqual(edited.growthRewardPresets["STANDARD"]?["TASK"]?.coinReward, 7)
        XCTAssertEqual(edited.mutations.last?.kind, "growthrewardpreset.update")

        let applied = try await store.applyGrowthPreset(.strong)
        XCTAssertEqual(applied.growthProfile?.rewardPreset, .strong)
        XCTAssertEqual(applied.mutations.last?.kind, "growthpreset.apply")
    }

    func testGrowthRewardRedemptionUsesSyncOutboxAndUpdatesInventoryOptimistically() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        _ = try await store.updateGrowthOverview(
            GrowthOverviewDTO(
                account: GrowthAccountDTO(level: 1, currentXp: 0, nextLevelXp: 100, coinBalance: 100),
                skills: nil,
                recentLedger: nil
            )
        )
        let reward = GrowthRewardDTO(
            id: "reward-1",
            name: "Coffee Break",
            description: "Take a break",
            icon: "cup.and.saucer.fill",
            price: 40,
            repeatable: false,
            version: 1,
            archivedAt: nil,
            listedInShop: true,
            _count: GrowthRedemptionCountDTO(redemptions: 0)
        )
        _ = try await store.updateGrowthRewards([reward])
        let redeemed = try await store.redeemGrowthReward(id: reward.id)

        XCTAssertEqual(redeemed.userCoins, 60)
        XCTAssertEqual(redeemed.inventoryItems.first?.quantity, 1)
        XCTAssertTrue(redeemed.shopItems.first?.isPurchased == true)
        XCTAssertEqual(redeemed.mutations.last?.kind, "growthshopreward.redeem")
    }

    func testTaskGrowthEarningRuleUpsertPersistsOptimisticRuleAndSyncPayload() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()

        let snapshot = try await store.upsertTaskGrowthEarningRule(
            taskID: "task-growth",
            coinReward: 12,
            skillAwards: ["skill-focus": 80, "skill-zero": 0],
            itemAwards: ["item-break": 2]
        )

        let rule = try XCTUnwrap(snapshot.growthEarningRules["task-growth"])
        let mutation = try XCTUnwrap(snapshot.mutations.last)
        XCTAssertEqual(rule.coinReward, 12)
        XCTAssertEqual(rule.skillAwards.map(\.skillId), ["skill-focus"])
        XCTAssertEqual(rule.skillAwards.map(\.xpReward), [80])
        XCTAssertEqual(rule.itemAwards.map(\.quantity), [2])
        XCTAssertEqual(mutation.kind, "growthearningrule.upsert")
        XCTAssertEqual(mutation.payload["sourceType"], .string("TASK"))
        XCTAssertEqual(mutation.payload["sourceId"], .string("task-growth"))
        XCTAssertEqual(mutation.payload["coinReward"], .number(12))
        XCTAssertEqual(
            mutation.payload["skillAwards"],
            .array([.object(["id": .string("skill-focus"), "amount": .number(80)])])
        )

        let reloaded = try await OfflineStore(accountID: "test-user", baseURL: temporaryDirectory).load()
        XCTAssertEqual(reloaded.growthEarningRules["task-growth"], rule)
    }

    func testTaskGrowthEarningRuleExplicitZeroAccountXPIsNotReplacedBySkillFallback() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let snapshot = try await store.upsertTaskGrowthEarningRule(
            taskID: "task-zero-account",
            coinReward: 0,
            accountXp: 0,
            skillAwards: ["skill-focus": 80],
            itemAwards: [:]
        )

        XCTAssertEqual(snapshot.growthEarningRules["task-zero-account"]?.accountXp, 0)
        XCTAssertEqual(snapshot.mutations.last?.payload["accountXp"], .number(0))
    }

    func testTaskGrowthEarningRuleRefreshPreservesPendingOptimisticUpsert() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        _ = try await store.upsertTaskGrowthEarningRule(
            taskID: "task-growth",
            coinReward: 12,
            skillAwards: ["skill-focus": 80],
            itemAwards: [:]
        )
        let staleServerRule = GrowthEarningRuleDTO(
            id: "rule-server",
            sourceType: .task,
            sourceId: "task-growth",
            coinReward: 1,
            enabled: true,
            scalingMode: .fixed,
            maxRewardCap: nil,
            version: 2,
            skillAwards: [],
            itemAwards: []
        )

        let refreshed = try await store.updateGrowthEarningRules([staleServerRule])

        XCTAssertEqual(refreshed.growthEarningRules["task-growth"]?.coinReward, 12)
        XCTAssertEqual(refreshed.growthEarningRules["task-growth"]?.skillAwards.first?.xpReward, 80)
        XCTAssertEqual(refreshed.mutations.filter { $0.kind == "growthearningrule.upsert" }.count, 1)
    }

    func testGrowthFixedBudgetUsesStableLargestRemainderAndArchivedSkillsDoNotConsumeCap() {
        let awards = [
            GrowthEarningRuleSkillAwardDTO(skillId: "z", xpReward: 70, skill: nil),
            GrowthEarningRuleSkillAwardDTO(skillId: "a", xpReward: 30, skill: nil),
            GrowthEarningRuleSkillAwardDTO(skillId: "archived", xpReward: 100, skill: GrowthSkillDTO(id: "archived", key: nil, name: "Archived", level: 1, maxLevel: 5, currentXp: 0, nextLevelXp: 100, category: nil, kind: "SKILL", description: nil, icon: "sparkles", color: nil, baseXp: 100, version: 1, archivedAt: "2026-01-01") ),
            GrowthEarningRuleSkillAwardDTO(skillId: "third", xpReward: 15, skill: nil)
        ]
        XCTAssertEqual(GrowthRewardMath.split(accountXp: 10, awards: awards.prefix(2).map { $0 }), [3, 7])
        XCTAssertEqual(GrowthRewardMath.selectedAwards(awards).map(\.skillId), ["a", "third", "z"])
        XCTAssertEqual(GrowthRewardMath.split(accountXp: 10, awards: awards).reduce(0, +), 10)

        let threeSkills = [
            GrowthEarningRuleSkillAwardDTO(skillId: "skill-c", xpReward: 10, skill: nil),
            GrowthEarningRuleSkillAwardDTO(skillId: "skill-a", xpReward: 60, skill: nil),
            GrowthEarningRuleSkillAwardDTO(skillId: "skill-b", xpReward: 30, skill: nil)
        ]
        XCTAssertEqual(GrowthRewardMath.split(accountXp: 10, awards: threeSkills), [6, 3, 1])
        XCTAssertEqual(
            GrowthRewardMath.split(accountXp: 10, awards: threeSkills + [
                GrowthEarningRuleSkillAwardDTO(skillId: "skill-extra", xpReward: 99, skill: nil)
            ]),
            [6, 3, 1]
        )
    }

    func testGrowthLedgerKeepsAccountSkillAndCoinCurrenciesDistinctInAccountOnlyOverview() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        let accountOnly = GrowthOverviewDTO(
            account: GrowthAccountDTO(level: 2, currentXp: 30, nextLevelXp: 100, coinBalance: 4),
            skills: nil,
            recentLedger: [
                GrowthLedgerDTO(id: "account", reason: "Task", xpAmount: 10, coinAmount: nil, createdAt: "2026-08-01T10:00:00Z", currency: "ACCOUNT_XP", amount: 10, kind: "AWARD", sourceType: "TASK", titleSnapshot: "Task"),
                GrowthLedgerDTO(id: "skill", reason: "Task", xpAmount: 7, coinAmount: nil, createdAt: "2026-08-01T10:01:00Z", currency: "SKILL_XP", amount: 7, kind: "AWARD", sourceType: "TASK", titleSnapshot: "Task"),
                GrowthLedgerDTO(id: "coin", reason: "Task", xpAmount: nil, coinAmount: 4, createdAt: "2026-08-01T10:02:00Z", currency: "COIN", amount: 4, kind: "AWARD", sourceType: "TASK", titleSnapshot: "Task")
            ]
        )

        let snapshot = try await store.updateGrowthOverview(accountOnly)
        XCTAssertTrue(snapshot.skills.isEmpty)
        XCTAssertEqual(snapshot.growthCurrentXp, 30)
        XCTAssertEqual(snapshot.transactions.map(\.amountAccountXP), [10, 0, 0])
        XCTAssertEqual(snapshot.transactions.map(\.amountSkillXP), [0, 7, 0])
        XCTAssertEqual(snapshot.transactions.map(\.amountCoins), [0, 0, 4])
        XCTAssertEqual(snapshot.transactions.map(\.amountXP), [10, 7, 0])
    }

    func testGrowthAttributeMappingRulesRequirePrimaryAndExactHundredPercent() {
        XCTAssertTrue(GrowthAttributeMappingRules.validate([
            GrowthAttributeMappingDraft(attributeId: "attr-1", slot: .primary, weight: 100)
        ]).valid)
        XCTAssertTrue(GrowthAttributeMappingRules.validate([
            GrowthAttributeMappingDraft(attributeId: "attr-1", slot: .primary, weight: 70),
            GrowthAttributeMappingDraft(attributeId: "attr-2", slot: .secondary, weight: 30)
        ]).valid)
        XCTAssertFalse(GrowthAttributeMappingRules.validate([
            GrowthAttributeMappingDraft(attributeId: "attr-1", slot: .primary, weight: 60),
            GrowthAttributeMappingDraft(attributeId: "attr-2", slot: .secondary, weight: 30)
        ]).valid)
        XCTAssertFalse(GrowthAttributeMappingRules.validate([
            GrowthAttributeMappingDraft(attributeId: "attr-1", slot: .primary, weight: 80),
            GrowthAttributeMappingDraft(attributeId: "attr-1", slot: .secondary, weight: 20)
        ]).valid)
    }

    func testGrowthAttributeMappingUpsertIsOptimisticAndSupersedesSameSkill() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()

        let first = try await store.upsertGrowthAttributeMappings(
            skillID: "skill-focus",
            mappings: [GrowthAttributeMappingDraft(attributeId: "attr-1", slot: .primary, weight: 100)]
        )
        let stale = try XCTUnwrap(first.mutations.last)
        _ = try await store.recordMutationFailures([stale.id], code: "VALIDATION_ERROR")
        let latest = try await store.upsertGrowthAttributeMappings(
            skillID: "skill-focus",
            mappings: [
                GrowthAttributeMappingDraft(attributeId: "attr-2", slot: .primary, weight: 70),
                GrowthAttributeMappingDraft(attributeId: "attr-3", slot: .secondary, weight: 30)
            ]
        )

        XCTAssertEqual(latest.growthAttributeMappings["skill-focus"]?.map(\.attributeId), ["attr-2", "attr-3"])
        let pending = latest.mutations.filter { $0.kind == "growthattributemapping.upsert" }
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.entityId, "skill-focus")
        XCTAssertNotEqual(pending.first?.id, stale.id)
        XCTAssertNil(pending.first?.lastErrorCode)
        XCTAssertEqual(pending.first?.payload["skillId"], .string("skill-focus"))
    }

    func testGrowthAttributeMappingPullDecodesGroupedResourceAndPreservesGeneralFilter() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let mappings = [
            GrowthAttributeMappingDTO(
                id: "map-1", skillId: "skill-focus", attributeId: "attr-1", slot: .primary, weight: 100,
                attribute: GrowthAttributeMappingAttributeRef(id: "attr-1", name: "Focus", kind: "ATTRIBUTE", icon: nil, color: nil, archivedAt: nil)
            )
        ]
        let jsonValue = try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(mappings))
        let result = try await store.applySync(
            acknowledgedMutationIds: [],
            conflicts: [],
            changes: [SyncChange(cursor: 4, entityType: "growthattributemapping", entityId: "skill-focus", deleted: false, data: jsonValue, complete: false)],
            cursor: "4"
        )

        XCTAssertEqual(result.growthAttributeMappings["skill-focus"]?.first?.attributeId, "attr-1")
    }

    func testGrowthAttributesExcludeArchivedAndSystemGeneralEntries() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let result = try await store.updateGrowthAttributes([
            GrowthSkillDTO(id: "general", key: "attribute-general", name: "General", level: 1, maxLevel: 1, currentXp: 0, nextLevelXp: 100, category: nil, kind: "ATTRIBUTE", description: nil, icon: nil, color: nil, baseXp: 100, version: 1),
            GrowthSkillDTO(id: "archived", key: "old", name: "Old", level: 1, maxLevel: 1, currentXp: 0, nextLevelXp: 100, category: nil, kind: "ATTRIBUTE", description: nil, icon: nil, color: nil, baseXp: 100, version: 1, archivedAt: "2026-01-01"),
            GrowthSkillDTO(id: "focus", key: "focus", name: "Focus", level: 1, maxLevel: 1, currentXp: 0, nextLevelXp: 100, category: nil, kind: "ATTRIBUTE", description: nil, icon: nil, color: nil, baseXp: 100, version: 1)
        ])

        XCTAssertEqual(result.attributes.map(\.id), ["focus"])
    }

    func testGrowthFetchSnapshotsAuthoritativelyClearEmptyAttributesSkillsAndLedger() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        _ = try await store.updateGrowthAttributes([
            GrowthSkillDTO(id: "attr", key: "focus", name: "Focus", level: 1, maxLevel: 1, currentXp: 1, nextLevelXp: 100, category: nil, kind: "ATTRIBUTE", description: nil, icon: nil, color: nil, baseXp: 100, version: 1)
        ])
        _ = try await store.updateGrowthSkills([
            GrowthSkillDTO(id: "skill", key: "focus", name: "Focus", level: 1, maxLevel: 1, currentXp: 1, nextLevelXp: 100, category: nil, kind: "SKILL", description: nil, icon: nil, color: nil, baseXp: 100, version: 1)
        ])
        _ = try await store.updateGrowthLedger([
            GrowthLedgerDTO(id: "entry", reason: "Task", xpAmount: 1, coinAmount: nil, createdAt: nil, currency: "SKILL_XP", amount: 1, kind: "AWARD", sourceType: "TASK", titleSnapshot: "Task")
        ])

        let emptyAttributes = try await store.updateGrowthAttributes([])
        let emptySkills = try await store.updateGrowthSkills([])
        let emptyLedger = try await store.updateGrowthLedger([])
        XCTAssertTrue(emptyAttributes.attributes.isEmpty)
        XCTAssertTrue(emptySkills.skills.isEmpty)
        XCTAssertTrue(emptyLedger.transactions.isEmpty)
    }

    func testGrowthAttributeFilteringRejectsNilKindGeneralAndWrongKind() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        var generalKey = GrowthSkillDTO(id: "general-key", key: nil, name: "Other", level: 1, maxLevel: 1, currentXp: 0, nextLevelXp: 100, category: nil, kind: "ATTRIBUTE", description: nil, icon: nil, color: nil, baseXp: 100, version: 1)
        generalKey.starterKey = "attribute-general"
        let result = try await store.updateGrowthAttributes([
            GrowthSkillDTO(id: "general-name", key: "anything", name: "General", level: 1, maxLevel: 1, currentXp: 0, nextLevelXp: 100, category: nil, kind: nil, description: nil, icon: nil, color: nil, baseXp: 100, version: 1),
            generalKey,
            GrowthSkillDTO(id: "skill-kind", key: "skill", name: "Skill", level: 1, maxLevel: 1, currentXp: 0, nextLevelXp: 100, category: nil, kind: "SKILL", description: nil, icon: nil, color: nil, baseXp: 100, version: 1),
            GrowthSkillDTO(id: "attribute", key: "focus", name: "Focus", level: 1, maxLevel: 1, currentXp: 0, nextLevelXp: 100, category: nil, kind: "ATTRIBUTE", description: nil, icon: nil, color: nil, baseXp: 100, version: 1)
        ])

        XCTAssertEqual(result.attributes.compactMap(\.id), ["attribute"])
    }

    func testGrowthReceiptLabelsUseAwardTypeAndDerivationMetadata() {
        let base = GrowthProgressAward(progressId: "a", name: "Focus", kind: "ATTRIBUTE", icon: nil, color: nil, xpGained: 1, beforeXp: 0, afterXp: 1, beforeLevel: 1, afterLevel: 1, nextLevelXp: 100)
        XCTAssertEqual(GrowthReceiptXPLabel.label(for: base), "Attribute XP")
        XCTAssertEqual(GrowthReceiptXPLabel.label(for: GrowthProgressAward(progressId: "a", name: "Focus", kind: "ATTRIBUTE", icon: nil, color: nil, xpGained: 1, beforeXp: 0, afterXp: 1, beforeLevel: 1, afterLevel: 1, nextLevelXp: 100, awardType: .attribute)), "Attribute XP")
        XCTAssertEqual(GrowthReceiptXPLabel.label(for: GrowthProgressAward(progressId: "a", name: "Focus", kind: "ATTRIBUTE", icon: nil, color: nil, xpGained: 1, beforeXp: 0, afterXp: 1, beforeLevel: 1, afterLevel: 1, nextLevelXp: 100, awardType: .attribute, derivedFromSkillId: "skill")), "Derived Attribute XP")
    }

    func testGrowthReceiptConflictRollbackRestoresProgressMetrics() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        _ = try await store.updateGrowthAttributes([
            GrowthSkillDTO(id: "attr", key: "focus", name: "Focus", level: 1, maxLevel: 5, currentXp: 40, nextLevelXp: 100, levelStartXp: 0, progressXp: 40, requiredXp: 100, category: nil, kind: "ATTRIBUTE", description: nil, icon: nil, color: nil, baseXp: 100, version: 1)
        ])
        let receipt = GrowthAwardReceipt(
            sourceType: .task,
            sourceId: "task",
            title: "Task",
            reverted: nil,
            accountAward: nil,
            progressAwards: [GrowthProgressAward(progressId: "attr", name: "Focus", kind: "ATTRIBUTE", icon: nil, color: nil, xpGained: 100, beforeXp: 40, afterXp: 140, beforeLevel: 1, afterLevel: 2, nextLevelXp: 400, awardType: .attribute)],
            coinAward: nil,
            itemAwards: []
        )
        _ = try await store.recordOptimisticGrowthReceipt(receipt, mutationId: "mapping-award")
        let rolledBack = try await store.reconcileGrowthOutcomes([], conflicts: [SyncConflict(mutationId: "mapping-award", entityType: "growth", entityId: "task", reason: "VERSION_CONFLICT", serverData: nil, localDraft: [:], conflictingFields: nil, kind: "task.update", occurredAt: nil)])
        let attribute = try XCTUnwrap(rolledBack.attributes.first)
        XCTAssertEqual(attribute.currentXP, 40)
        XCTAssertEqual(attribute.level, 1)
        XCTAssertEqual(attribute.nextLevelXP, 100)
        XCTAssertEqual(attribute.progressXP, 40)
        XCTAssertEqual(attribute.requiredXP, 100)
    }

    func testMutationFailureMetadataIsVisibleAndRetryClearsIt() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let queued = try await store.upsertGrowthAttributeMappings(skillID: "skill", mappings: [GrowthAttributeMappingDraft(attributeId: "attr", slot: .primary, weight: 100)])
        let mutation = try XCTUnwrap(queued.mutations.last)
        let failed = try await store.recordMutationFailures([mutation.id], code: "VALIDATION_ERROR")
        XCTAssertEqual(failed.mutations.last?.lastErrorCode, "VALIDATION_ERROR")
        XCTAssertEqual(failed.mutations.last?.attemptCount, 1)
        let retried = try await store.retryMutation(mutation.id)
        XCTAssertNil(retried.mutations.last?.lastErrorCode)
        let acked = try await store.applySync(acknowledgedMutationIds: [mutation.id], conflicts: [], changes: [], cursor: retried.cursor)
        XCTAssertTrue(acked.mutations.isEmpty)
    }

    func testPersistedPendingReceiptCanReconcileAfterRestartWithoutRemainingPendingState() async throws {
        let mutationID = "restart-receipt"
        let receipt = GrowthAwardReceipt(
            sourceType: .task,
            sourceId: "task",
            title: "Task",
            reverted: nil,
            accountAward: nil,
            progressAwards: [],
            coinAward: nil,
            itemAwards: []
        )
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        _ = try await store.recordOptimisticGrowthReceipt(receipt, mutationId: mutationID)

        let restarted = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        let loaded = try await restarted.load()
        XCTAssertNotNil(loaded.pendingGrowthReceipts[mutationID])
        let reconciled = try await restarted.reconcileGrowthOutcomes(
            [SyncMutationOutcome(mutationId: mutationID, growthReceipt: receipt)],
            conflicts: []
        )
        XCTAssertNil(reconciled.pendingGrowthReceipts[mutationID])
        XCTAssertTrue(reconciled.handledGrowthMutationIds.contains(mutationID))
    }

    func testGrowthLedgerSeparatesAttributeAndDerivedAttributeXPFromReceiptMetadata() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let result = try await store.updateGrowthLedger([
            GrowthLedgerDTO(id: "attribute", reason: "Task", xpAmount: 7, coinAmount: nil, createdAt: nil, currency: "SKILL_XP", amount: 7, kind: "AWARD", sourceType: "TASK", titleSnapshot: "Task", metadata: ["awardType": .string("ATTRIBUTE")]),
            GrowthLedgerDTO(id: "derived", reason: "Task", xpAmount: 3, coinAmount: nil, createdAt: nil, currency: "SKILL_XP", amount: 3, kind: "AWARD", sourceType: "TASK", titleSnapshot: "Task", metadata: ["awardType": .string("ATTRIBUTE"), "derivedFromSkillId": .string("skill-focus")])
        ])

        XCTAssertEqual(result.transactions.map(\.amountAttributeXP), [7, 0])
        XCTAssertEqual(result.transactions.map(\.amountDerivedAttributeXP), [0, 3])
    }

    func testGrowthOverviewUsesCanonicalCoinAmountWhenCoinAmountFieldIsAbsent() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let snapshot = try await store.updateGrowthOverview(GrowthOverviewDTO(
            account: nil,
            skills: nil,
            recentLedger: [GrowthLedgerDTO(id: "coin", reason: "Reward", xpAmount: nil, coinAmount: nil, createdAt: nil, currency: "COIN", amount: 9, kind: "AWARD", sourceType: "TASK", titleSnapshot: "Reward")]
        ))

        XCTAssertEqual(snapshot.transactions.first?.amountCoins, 9)
    }

    func testGrowthReceiptApplyRollbackAndDedupUseAuthoritativeOutcome() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        _ = try await store.updateGrowthOverview(
            GrowthOverviewDTO(
                account: GrowthAccountDTO(level: 1, currentXp: 90, nextLevelXp: 100, coinBalance: 5),
                skills: nil,
                recentLedger: nil
            )
        )

        let optimistic = GrowthAwardReceipt(
            sourceType: .task,
            sourceId: "task-1",
            title: "Task",
            reverted: nil,
            accountAward: GrowthAccountAward(amount: 10, beforeXp: 90, afterXp: 110, beforeLevel: 1, afterLevel: 2, nextLevelXp: 400),
            progressAwards: [],
            coinAward: GrowthCoinAward(amount: 2, balanceAfter: 7),
            itemAwards: []
        )
        let applied = try await store.recordOptimisticGrowthReceipt(optimistic, mutationId: "mutation-1")
        XCTAssertEqual(applied.growthCurrentXp, 110)
        XCTAssertEqual(applied.userCoins, 7)
        let retried = try await store.recordOptimisticGrowthReceipt(optimistic, mutationId: "mutation-1")
        XCTAssertEqual(retried.growthCurrentXp, 110)

        let conflicted = try await store.reconcileGrowthOutcomes(
            [],
            conflicts: [SyncConflict(
                mutationId: "mutation-1",
                entityType: "growth",
                entityId: "task-1",
                reason: "VERSION_CONFLICT",
                serverData: nil,
                localDraft: [:],
                conflictingFields: nil,
                kind: "task.update",
                occurredAt: nil
            )]
        )
        XCTAssertEqual(conflicted.growthCurrentXp, 90)
        XCTAssertEqual(conflicted.growthNextLevelXp, 100, "rollback must restore account level threshold")
        XCTAssertEqual(conflicted.userCoins, 5)

        // Re-apply an optimistic award before checking authoritative replacement.
        _ = try await store.recordOptimisticGrowthReceipt(optimistic, mutationId: "mutation-2")

        let authoritative = GrowthAwardReceipt(
            sourceType: .task,
            sourceId: "task-1",
            title: "Task",
            reverted: nil,
            accountAward: GrowthAccountAward(amount: 12, beforeXp: 110, afterXp: 122, beforeLevel: 2, afterLevel: 2, nextLevelXp: 400),
            progressAwards: [],
            coinAward: GrowthCoinAward(amount: 3, balanceAfter: 10),
            itemAwards: []
        )
        let outcome = SyncMutationOutcome(mutationId: "mutation-2", growthReceipt: authoritative)
        let reconciled = try await store.reconcileGrowthOutcomes([outcome], conflicts: [])
        XCTAssertEqual(reconciled.growthCurrentXp, 122)
        XCTAssertEqual(reconciled.userCoins, 10)
        XCTAssertEqual(reconciled.handledGrowthMutationIds, ["mutation-2"])
        let deduped = try await store.reconcileGrowthOutcomes([outcome], conflicts: [])
        XCTAssertEqual(deduped.growthCurrentXp, 122)
        XCTAssertEqual(deduped.userCoins, 10)
    }

    func testOfflineHabitRuleLookupAndOccurrenceLifecycleTransitions() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let habit = HabitModel(id: "habit-growth", name: "Read", startDate: "2026-08-01T00:00:00Z")
        _ = try await store.saveHabit(habit)
        _ = try await store.updateHabitOccurrences([
            HabitOccurrenceModel(id: "occurrence-1", habitId: habit.id, occurrenceDate: "2026-08-01", status: .pending)
        ])
        let rule = GrowthEarningRuleDTO(
            id: "rule-habit",
            sourceType: .habit,
            sourceId: habit.id,
            coinReward: 2,
            accountXp: 10,
            enabled: true,
            scalingMode: .fixed,
            maxRewardCap: nil,
            version: 1,
            skillAwards: [],
            itemAwards: []
        )
        let withRule = try await store.updateGrowthEarningRules([rule])
        XCTAssertEqual(withRule.growthEarningRules[habit.id], rule)

        let checked = try await store.checkInHabitOccurrence(id: "occurrence-1", value: 3)
        XCTAssertEqual(checked.habitOccurrences.first?.status, .completed)
        XCTAssertEqual(checked.habitOccurrences.first?.value, 3)
        XCTAssertEqual(checked.mutations.last?.kind, "habitoccurrence.checkin")
        let skipped = try await store.habitOccurrenceAction(id: "occurrence-1", action: "skip")
        XCTAssertEqual(skipped.habitOccurrences.first?.status, .skipped)
        let failed = try await store.habitOccurrenceAction(id: "occurrence-1", action: "fail")
        XCTAssertEqual(failed.habitOccurrences.first?.status, .failed)
        let undone = try await store.habitOccurrenceAction(id: "occurrence-1", action: "undo")
        XCTAssertEqual(undone.habitOccurrences.first?.status, .pending)
        XCTAssertEqual(undone.habitOccurrences.first?.value, 0)
        let reloaded = try await OfflineStore(accountID: "test-user", baseURL: temporaryDirectory).load()
        XCTAssertEqual(reloaded.growthEarningRules[habit.id]?.accountXp, 10)
        XCTAssertEqual(reloaded.habitOccurrences.first?.status, .pending)
    }

    func testHabitPartialCheckInStaysPendingAndPersistsIdempotencyKey() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let habit = HabitModel(
            id: "habit-quantity",
            name: "Read",
            targetValue: 5,
            targetType: "COUNT",
            startDate: "2026-08-01T00:00:00Z"
        )
        _ = try await store.saveHabit(habit)
        _ = try await store.updateHabitOccurrences([
            HabitOccurrenceModel(id: "occurrence-quantity", habitId: habit.id, occurrenceDate: "2026-08-01")
        ])

        let key = "habit-checkin-stable"
        let snapshot = try await store.checkInHabitOccurrence(
            id: "occurrence-quantity",
            value: 2,
            idempotencyKey: key
        )
        XCTAssertEqual(snapshot.habitOccurrences.first?.status, .pending)
        XCTAssertEqual(snapshot.habitOccurrences.first?.value, 2)
        let mutation = try XCTUnwrap(snapshot.mutations.last)
        XCTAssertEqual(mutation.payload["idempotencyKey"]?.stringValue, key)

        let restarted = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        let reloaded = try await restarted.load()
        XCTAssertEqual(reloaded.mutations.last?.payload["idempotencyKey"]?.stringValue, key)
        let retried = try await restarted.retryMutation(mutation.id, keepLocal: true)
        XCTAssertEqual(retried.mutations.last?.payload["idempotencyKey"]?.stringValue, key)
        XCTAssertNotEqual(retried.mutations.last?.id, mutation.id)
    }

    func testHabitActionAndStudyReviewCarryStableKeys() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let habit = HabitModel(id: "habit-action", name: "Read", startDate: "2026-08-01T00:00:00Z")
        _ = try await store.saveHabit(habit)
        _ = try await store.updateHabitOccurrences([
            HabitOccurrenceModel(id: "occurrence-action", habitId: habit.id, occurrenceDate: "2026-08-01")
        ])
        let actionSnapshot = try await store.habitOccurrenceAction(
            id: "occurrence-action",
            action: "skip",
            idempotencyKey: "habit-action-stable"
        )
        XCTAssertEqual(actionSnapshot.mutations.last?.payload["idempotencyKey"]?.stringValue, "habit-action-stable")

        let reviewSnapshot = try await store.submitReview(
            sessionId: "session-1",
            cardId: "card-1",
            grade: "GOOD",
            idempotencyKey: "review-stable"
        )
        XCTAssertEqual(reviewSnapshot.mutations.last?.payload["idempotencyKey"]?.stringValue, "review-stable")

        let restarted = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        let reloaded = try await restarted.load()
        XCTAssertEqual(reloaded.mutations.last?.kind, "review.create")
        XCTAssertEqual(reloaded.mutations.last?.payload["idempotencyKey"]?.stringValue, "review-stable")
        let retried = try await restarted.retryMutation(reloaded.mutations.last!.id, keepLocal: true)
        XCTAssertEqual(retried.mutations.last?.payload["idempotencyKey"]?.stringValue, "review-stable")
    }

    func testAuthoritativeReceiptDecodesReversedAliasAndReceiptKey() throws {
        let data = Data(
            """
            {"sourceType":"HABIT","sourceId":"occurrence-1","title":"Read","reversed":true,"receiptKey":"receipt-1","progressAwards":[],"coinAward":null,"itemAwards":[]}
            """.utf8
        )
        let receipt = try JSONDecoder().decode(GrowthAwardReceipt.self, from: data)
        XCTAssertTrue(receipt.isReversal)
        XCTAssertEqual(receipt.receiptKey, "receipt-1")
    }

    func testReceiptKeySuppressesReplayAcrossMutationIdsAndRestart() async throws {
        let store = OfflineStore(accountID: "receipt-key-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        _ = try await store.updateGrowthOverview(
            GrowthOverviewDTO(account: GrowthAccountDTO(level: 1, currentXp: 0, nextLevelXp: 100, coinBalance: 0), skills: nil, recentLedger: nil)
        )
        let receipt = GrowthAwardReceipt(
            sourceType: .task,
            sourceId: "task-1",
            title: "Task",
            accountAward: GrowthAccountAward(amount: 4, beforeXp: 0, afterXp: 4, beforeLevel: 1, afterLevel: 1, nextLevelXp: 100),
            receiptKey: "award-lifecycle-1"
        )
        _ = try await store.reconcileGrowthOutcomes([SyncMutationOutcome(mutationId: "m-1", growthReceipt: receipt)], conflicts: [])
        let restarted = OfflineStore(accountID: "receipt-key-user", baseURL: temporaryDirectory)
        _ = try await restarted.load()
        let replay = try await restarted.reconcileGrowthOutcomes([SyncMutationOutcome(mutationId: "m-2", growthReceipt: receipt)], conflicts: [])
        XCTAssertEqual(replay.growthCurrentXp, 4)
        XCTAssertEqual(replay.handledGrowthReceiptKeys, ["award-lifecycle-1"])
    }

    func testGrowthReceiptLifecycleReversalReearnAndItemsAreExactlyOnce() async throws {
        let store = OfflineStore(accountID: "receipt-lifecycle-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        _ = try await store.updateGrowthOverview(
            GrowthOverviewDTO(account: GrowthAccountDTO(level: 1, currentXp: 0, nextLevelXp: 100, coinBalance: 0), skills: nil, recentLedger: nil)
        )

        let earned = GrowthAwardReceipt(
            sourceType: .habit,
            sourceId: "occurrence-1",
            title: "Read",
            coinAward: GrowthCoinAward(amount: 5, balanceAfter: 5),
            itemAwards: [GrowthItemAward(itemId: "item-1", name: "Token", icon: "gift", color: nil, quantity: 2, inventoryQuantityAfter: 2)],
            receiptKey: "earned:HABIT:occurrence-1:lc0"
        )
        let reversal = GrowthAwardReceipt(
            sourceType: .habit,
            sourceId: "occurrence-1",
            title: "Read",
            reverted: true,
            coinAward: GrowthCoinAward(amount: 5, balanceAfter: 0),
            itemAwards: [GrowthItemAward(itemId: "item-1", name: "Token", icon: "gift", color: nil, quantity: 2, inventoryQuantityAfter: 0)],
            receiptKey: "reverted:HABIT:occurrence-1:lc0"
        )
        let reearned = GrowthAwardReceipt(
            sourceType: .habit,
            sourceId: "occurrence-1",
            title: "Read",
            coinAward: GrowthCoinAward(amount: 5, balanceAfter: 5),
            itemAwards: [GrowthItemAward(itemId: "item-1", name: "Token", icon: "gift", color: nil, quantity: 2, inventoryQuantityAfter: 2)],
            receiptKey: "earned:HABIT:occurrence-1:lc1"
        )

        _ = try await store.reconcileGrowthOutcomes([SyncMutationOutcome(mutationId: "earn", growthReceipt: earned)], conflicts: [])
        _ = try await store.reconcileGrowthOutcomes([SyncMutationOutcome(mutationId: "reverse", growthReceipt: reversal)], conflicts: [])
        let restarted = OfflineStore(accountID: "receipt-lifecycle-user", baseURL: temporaryDirectory)
        _ = try await restarted.load()
        let reearnedSnapshot = try await restarted.reconcileGrowthOutcomes([SyncMutationOutcome(mutationId: "reearn", growthReceipt: reearned)], conflicts: [])
        let replayed = try await restarted.reconcileGrowthOutcomes([SyncMutationOutcome(mutationId: "reearn-replay", growthReceipt: reearned)], conflicts: [])

        XCTAssertEqual(reearnedSnapshot.userCoins, 5)
        XCTAssertEqual(reearnedSnapshot.inventoryItems.first?.quantity, 2)
        XCTAssertEqual(replayed.userCoins, 5)
        XCTAssertEqual(replayed.inventoryItems.first?.quantity, 2)
        XCTAssertEqual(replayed.handledGrowthReceiptKeys, [
            "earned:HABIT:occurrence-1:lc0",
            "reverted:HABIT:occurrence-1:lc0",
            "earned:HABIT:occurrence-1:lc1"
        ])
    }

    func testOptimisticHabitReversalRestoresGrowthCurrenciesImmediately() async throws {
        let store = OfflineStore(accountID: "habit-reversal-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        _ = try await store.updateGrowthOverview(
            GrowthOverviewDTO(
                account: GrowthAccountDTO(level: 1, currentXp: 0, nextLevelXp: 100, coinBalance: 0),
                skills: nil,
                recentLedger: nil
            )
        )

        let earned = GrowthAwardReceipt(
            sourceType: .habit,
            sourceId: "occurrence-1",
            title: "Read",
            accountAward: GrowthAccountAward(amount: 10, beforeXp: 0, afterXp: 10, beforeLevel: 1, afterLevel: 1, nextLevelXp: 100),
            coinAward: GrowthCoinAward(amount: 2, balanceAfter: 2),
            itemAwards: [GrowthItemAward(itemId: "item-1", name: "Token", icon: "gift", color: nil, quantity: 1, inventoryQuantityAfter: 1)]
        )
        let reversed = GrowthAwardReceipt(
            sourceType: .habit,
            sourceId: "occurrence-1",
            title: "Read",
            reverted: true,
            accountAward: GrowthAccountAward(amount: 10, beforeXp: 10, afterXp: 0, beforeLevel: 1, afterLevel: 1, nextLevelXp: 100),
            coinAward: GrowthCoinAward(amount: 2, balanceAfter: 0),
            itemAwards: [GrowthItemAward(itemId: "item-1", name: "Token", icon: "gift", color: nil, quantity: 1, inventoryQuantityAfter: 0)]
        )

        let earnedSnapshot = try await store.recordOptimisticGrowthReceipt(earned, mutationId: "habit-checkin")
        XCTAssertEqual(earnedSnapshot.growthCurrentXp, 10)
        XCTAssertEqual(earnedSnapshot.userCoins, 2)
        XCTAssertEqual(earnedSnapshot.inventoryItems.first?.quantity, 1)

        let reversedSnapshot = try await store.recordOptimisticGrowthReceipt(reversed, mutationId: "habit-undo")
        XCTAssertEqual(reversedSnapshot.growthCurrentXp, 0)
        XCTAssertEqual(reversedSnapshot.userCoins, 0)
        XCTAssertEqual(reversedSnapshot.inventoryItems.first?.quantity, 0)
    }

    func testGrowthReceiptAccountAwardDoesNotAggregateSkillAwards() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        _ = try await store.updateGrowthOverview(
            GrowthOverviewDTO(
                account: GrowthAccountDTO(level: 1, currentXp: 20, nextLevelXp: 100, coinBalance: 0),
                skills: nil,
                recentLedger: nil
            )
        )
        let receipt = GrowthAwardReceipt(
            sourceType: .task,
            sourceId: "task-1",
            title: "Task",
            reverted: nil,
            accountAward: GrowthAccountAward(amount: 10, beforeXp: 20, afterXp: 30, beforeLevel: 1, afterLevel: 1, nextLevelXp: 100),
            progressAwards: [GrowthProgressAward(progressId: "skill-1", name: "Skill", kind: "SKILL", icon: "sparkles", color: nil, xpGained: 10, beforeXp: 0, afterXp: 10, beforeLevel: 1, afterLevel: 1, nextLevelXp: 100)],
            coinAward: nil,
            itemAwards: []
        )
        let snapshot = try await store.recordOptimisticGrowthReceipt(receipt, mutationId: "mutation-1")
        XCTAssertEqual(snapshot.growthCurrentXp, 30)
    }

    func testGrowthReceiptDecodesAccountAwardAndLegacyPayloads() throws {
        let accountAwardJSON = """
        {"sourceType":"TASK","sourceId":"task-1","title":"Task","accountAward":{"amount":10,"beforeXp":20,"afterXp":30,"beforeLevel":1,"afterLevel":1,"nextLevelXp":100},"progressAwards":[],"coinAward":null,"itemAwards":[]}
        """.data(using: .utf8)!
        let accountAwardReceipt = try JSONDecoder().decode(GrowthAwardReceipt.self, from: accountAwardJSON)
        XCTAssertEqual(accountAwardReceipt.accountAward?.amount, 10)

        let legacyJSON = """
        {"sourceType":"TASK","sourceId":"task-1","title":"Task","progressAwards":[],"coinAward":null,"itemAwards":[]}
        """.data(using: .utf8)!
        let legacyReceipt = try JSONDecoder().decode(GrowthAwardReceipt.self, from: legacyJSON)
        XCTAssertNil(legacyReceipt.accountAward)
    }

    func testGrowthTaskRewardDefaultPersistsAccountBudgetAndWeights() async throws {
        let store = OfflineStore(accountID: "reward-default-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let snapshot = try await store.upsertGrowthTaskRewardDefault(
            taskListID: nil,
            coinReward: 4,
            accountXp: 100,
            enabled: true,
            skillAwards: ["z": 70, "a": 30, "extra": 10, "ignored": 5],
            itemAwards: ["item-1": 2]
        )
        let value = try XCTUnwrap(snapshot.growthTaskRewardDefaults["GLOBAL"])
        XCTAssertEqual(value.accountXp, 100)
        XCTAssertEqual(value.skillAwards.map(\.skillId), ["a", "extra", "ignored"])
        XCTAssertEqual(value.itemAwards.first?.quantity, 2)
        XCTAssertEqual(snapshot.mutations.last?.kind, "growthtaskrewarddefault.upsert")

        let reloaded = try await OfflineStore(accountID: "reward-default-user", baseURL: temporaryDirectory).load()
        XCTAssertEqual(reloaded.growthTaskRewardDefaults["GLOBAL"]?.accountXp, 100)
    }

    func testSetTaskStatusPersistsSpecificStatusTransitions() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()

        let (task, _) = try await store.createTask(title: "Status Test Task")
        let updatedPlanned = try await store.setTaskStatus(id: task.id, status: .planned, completedAt: nil)
        XCTAssertEqual(updatedPlanned.snapshot.tasks.first?.status, .planned)

        let updatedInProgress = try await store.setTaskStatus(id: task.id, status: .inProgress, completedAt: nil)
        XCTAssertEqual(updatedInProgress.snapshot.tasks.first?.status, .inProgress)

        let now = ISO8601DateFormatter().string(from: Date())
        let updatedCompleted = try await store.setTaskStatus(id: task.id, status: .completed, completedAt: now)
        XCTAssertEqual(updatedCompleted.snapshot.tasks.first?.status, .completed)
        XCTAssertNotNil(updatedCompleted.snapshot.tasks.first?.completedAt)
        XCTAssertEqual(updatedCompleted.snapshot.mutations.last?.payload["completedAt"]?.stringValue, now)

        for status in [TaskStatus.inbox, .canceled, .archived] {
            let updated = try await store.setTaskStatus(id: task.id, status: status, completedAt: nil)
            XCTAssertEqual(updated.snapshot.tasks.first?.status, status)
            XCTAssertNil(updated.snapshot.tasks.first?.completedAt)
            XCTAssertEqual(updated.snapshot.mutations.last?.payload["status"]?.stringValue, status.rawValue)
            XCTAssertEqual(updated.snapshot.mutations.last?.payload["completedAt"], .null)
        }
    }

    func testProductivityTaskDecodesWithoutClientOnlyFields() throws {
        let json = """
        {
            "id": "task-server-1",
            "title": "Server Task",
            "priority": "HIGH",
            "important": false,
            "status": "COMPLETED",
            "completedAt": "2026-08-08T10:00:00.000Z",
            "sortOrder": 1.0,
            "version": 2
        }
        """.data(using: .utf8)!

        let decoded = try JSONDecoder().decode(ProductivityTask.self, from: json)
        XCTAssertEqual(decoded.id, "task-server-1")
        XCTAssertEqual(decoded.title, "Server Task")
        XCTAssertEqual(decoded.status, .completed)
        XCTAssertTrue(decoded.urgent)
        XCTAssertFalse(decoded.urgencyReason.isEmpty)
    }

    func testPullDoesNotOverwritePendingOptimisticEdit() async throws {
        let store = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let (task, created) = try await store.createTask(title: "Original")
        let createMutationID = try XCTUnwrap(created.mutations.first?.id)
        let edited = try await store.editTask(
            id: task.id,
            edits: TaskEdits(
                title: "Local revision",
                descriptionMarkdown: "Pending notes",
                priority: .medium,
                important: true,
                dueAt: nil,
                estimatedMinutes: 45
            )
        )

        var staleServerTask = task
        staleServerTask.version = 2
        staleServerTask.urgencyReason = ""
        let resourceData = try JSONEncoder().encode(staleServerTask)
        let resource = try JSONDecoder().decode(JSONValue.self, from: resourceData)

        let result = try await store.applySync(
            acknowledgedMutationIds: [createMutationID],
            conflicts: [],
            changes: [
                SyncChange(
                    cursor: 2,
                    entityType: "task",
                    entityId: task.id,
                    deleted: false,
                    data: resource,
                    complete: true
                )
            ],
            cursor: "2",
            lastSyncTime: "2026-07-31T00:00:00.000Z"
        )

        XCTAssertEqual(result.mutations.count, edited.mutations.count - 1)
        XCTAssertEqual(result.tasks.first?.title, "Local revision")
        XCTAssertEqual(result.tasks.first?.descriptionMarkdown, "Pending notes")
        XCTAssertEqual(result.tasks.first?.estimatedMinutes, 45)

        let reloadedStore = OfflineStore(accountID: "test-user", baseURL: temporaryDirectory)
        let reloaded = try await reloadedStore.load()
        XCTAssertEqual(reloaded.tasks.first?.title, "Local revision")
    }

    func testLegacySnapshotDecodesWithoutFocusSessions() throws {
        let data = Data(#"{"cursor":"7","tasks":[],"mutations":[],"conflicts":[]}"#.utf8)
        let snapshot = try JSONDecoder().decode(OfflineSnapshot.self, from: data)

        XCTAssertEqual(snapshot.cursor, "7")
        XCTAssertTrue(snapshot.focusSessions.isEmpty)
    }

    func testFocusSessionAndMutationPersistAtomicallyAcrossRestart() async throws {
        let store = OfflineStore(accountID: "focus-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let session = makeFocusSession()
        let mutation = SyncMutation(
            id: ULID.generate(),
            kind: "focussession.create",
            entityId: session.id,
            payload: [
                "mode": .string("COUNTDOWN"),
                "plannedSeconds": .number(1_800),
                "startedAt": .string(session.startedAt)
            ],
            occurredAt: session.startedAt
        )

        _ = try await store.saveFocusSession(session, mutation: mutation)
        let reloaded = try await OfflineStore(
            accountID: "focus-user",
            baseURL: temporaryDirectory
        ).load()

        XCTAssertEqual(reloaded.focusSessions.first, session)
        XCTAssertEqual(reloaded.mutations.first?.kind, "focussession.create")
        XCTAssertEqual(reloaded.mutations.first?.entityId, session.id)
    }

    func testFocusMutationPersistsIdempotencyAndExpectedVersionFields() async throws {
        let store = OfflineStore(accountID: "focus-key-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let session = makeFocusSession()
        let mutation = SyncMutation(
            id: "focus-action-mutation",
            kind: "focussession.action",
            entityId: session.id,
            baseVersion: session.version,
            payload: [
                "action": .string("complete"),
                "idempotencyKey": .string("focus-action-stable"),
                "expectedVersion": .number(Double(session.version)),
                "occurredAt": .string(session.startedAt)
            ],
            occurredAt: session.startedAt
        )
        _ = try await store.saveFocusSession(session, mutation: mutation)

        let reloaded = try await OfflineStore(accountID: "focus-key-user", baseURL: temporaryDirectory).load()
        XCTAssertEqual(reloaded.mutations.first?.payload["idempotencyKey"]?.stringValue, "focus-action-stable")
        XCTAssertEqual(reloaded.mutations.first?.payload["expectedVersion"]?.numberValue, Double(session.version))
    }

    func testFocusLifecycleKeysAndVersionsSurviveRestart() async throws {
        let store = OfflineStore(accountID: "focus-lifecycle-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let session = makeFocusSession()
        let start = SyncMutation(
            id: "focus-start",
            kind: "focussession.create",
            entityId: session.id,
            payload: [
                "idempotencyKey": .string("focus-start-stable"),
                "mode": .string("COUNTDOWN"),
                "plannedSeconds": .number(1_800),
                "startedAt": .string(session.startedAt)
            ],
            occurredAt: session.startedAt
        )
        _ = try await store.saveFocusSession(session, mutation: start)

        var paused = session
        paused.status = .paused
        paused.version = 2
        let action = SyncMutation(
            id: "focus-action",
            kind: "focussession.action",
            entityId: session.id,
            baseVersion: session.version,
            payload: [
                "action": .string("pause"),
                "idempotencyKey": .string("focus-action-stable"),
                "expectedVersion": .number(Double(session.version))
            ],
            occurredAt: session.startedAt
        )
        _ = try await store.saveFocusSession(paused, mutation: action)

        var adjusted = paused
        adjusted.version = 3
        let adjust = SyncMutation(
            id: "focus-adjust",
            kind: "focussession.adjust",
            entityId: session.id,
            baseVersion: paused.version,
            payload: [
                "startedAt": .string("2026-08-01T09:00:00Z"),
                "completedAt": .string("2026-08-01T09:30:00Z"),
                "taskId": .null,
                "idempotencyKey": .string("focus-adjust-stable"),
                "expectedVersion": .number(Double(paused.version))
            ],
            occurredAt: session.startedAt
        )
        _ = try await store.saveFocusSession(adjusted, mutation: adjust)

        let reloaded = try await OfflineStore(accountID: "focus-lifecycle-user", baseURL: temporaryDirectory).load()
        XCTAssertEqual(reloaded.mutations.map(\.id), ["focus-start", "focus-action", "focus-adjust"])
        XCTAssertEqual(reloaded.mutations.map { $0.payload["idempotencyKey"]?.stringValue }, [
            "focus-start-stable", "focus-action-stable", "focus-adjust-stable"
        ])
        XCTAssertEqual(reloaded.mutations[1].payload["expectedVersion"]?.numberValue, 1)
        XCTAssertEqual(reloaded.mutations[2].payload["expectedVersion"]?.numberValue, 2)
        XCTAssertEqual(reloaded.mutations[2].baseVersion, 2)
    }

    func testPullDoesNotOverwritePendingOptimisticFocusAction() async throws {
        let store = OfflineStore(accountID: "focus-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        var paused = makeFocusSession()
        paused.status = .paused
        paused.pausedAt = "2026-07-31T00:10:00Z"
        paused.version = 2
        let mutation = SyncMutation(
            id: ULID.generate(),
            kind: "focussession.action",
            entityId: paused.id,
            baseVersion: 1,
            payload: [
                "action": .string("pause"),
                "occurredAt": .string(paused.pausedAt!)
            ],
            occurredAt: paused.pausedAt!
        )
        _ = try await store.saveFocusSession(paused, mutation: mutation)

        let stale = makeFocusSession()
        let resourceData = try JSONEncoder().encode(stale)
        let resource = try JSONDecoder().decode(JSONValue.self, from: resourceData)
        let result = try await store.applySync(
            acknowledgedMutationIds: [],
            conflicts: [],
            changes: [
                SyncChange(
                    cursor: 8,
                    entityType: "focussession",
                    entityId: stale.id,
                    deleted: false,
                    data: resource,
                    complete: true
                )
            ],
            cursor: "8",
            lastSyncTime: "2026-07-31T00:11:00Z"
        )

        XCTAssertEqual(result.focusSessions.first?.status, .paused)
        XCTAssertEqual(result.focusSessions.first?.version, 2)
        XCTAssertEqual(result.cursor, "8")
    }

    func testStaleRefreshDoesNotRollbackAcknowledgedOptimisticFocusAction() async throws {
        let store = OfflineStore(accountID: "focus-ack-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        var paused = makeFocusSession()
        paused.status = .paused
        paused.pausedAt = "2026-07-31T00:10:00Z"
        paused.version = 2
        let mutation = SyncMutation(
            id: "focus-ack-action",
            kind: "focussession.action",
            entityId: paused.id,
            baseVersion: 1,
            payload: ["action": .string("pause")],
            occurredAt: paused.pausedAt!
        )
        _ = try await store.saveFocusSession(paused, mutation: mutation)

        var stale = paused
        stale.status = .active
        stale.pausedAt = nil
        stale.version = 1
        let resource = try JSONDecoder().decode(
            JSONValue.self,
            from: JSONEncoder().encode(stale)
        )
        let pulled = try await store.applySync(
            acknowledgedMutationIds: [mutation.id],
            conflicts: [],
            changes: [SyncChange(
                cursor: 9,
                entityType: "focussession",
                entityId: stale.id,
                deleted: false,
                data: resource,
                complete: true
            )],
            cursor: "9",
            lastSyncTime: "2026-07-31T00:11:00Z"
        )

        XCTAssertEqual(pulled.focusSessions.first?.status, .paused)
        XCTAssertEqual(pulled.focusSessions.first?.version, 2)

        let refreshed = try await store.hydrateFocus(active: stale, history: [stale])
        XCTAssertEqual(refreshed.focusSessions.first?.status, .paused)
        XCTAssertEqual(refreshed.focusSessions.first?.version, 2)
    }

    func testTaskMoveToListPersistsTaskListIdOnlyWhenFlagSet() async throws {
        let store = OfflineStore(accountID: "move-list-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let (_, created) = try await store.createTask(title: "Move me", taskListId: "list-1")
        let task = try XCTUnwrap(created.tasks.first(where: { $0.title == "Move me" }))

        // Unrelated edit must NOT clear or change the list.
        let unrelated = try await store.editTask(
            id: task.id,
            edits: TaskEdits(
                title: "Move me updated",
                descriptionMarkdown: task.descriptionMarkdown,
                priority: task.priority,
                important: task.important,
                dueAt: task.dueAt,
                estimatedMinutes: task.estimatedMinutes
            )
        )
        let unrelatedTask = try XCTUnwrap(unrelated.tasks.first(where: { $0.id == task.id }))
        XCTAssertEqual(unrelatedTask.taskListId, "list-1")
        XCTAssertNil(unrelated.mutations.last?.payload["taskListId"])

        // Explicit move writes taskListId into the update mutation.
        let moved = try await store.editTask(
            id: task.id,
            edits: TaskEdits(
                title: "Move me",
                descriptionMarkdown: task.descriptionMarkdown,
                priority: task.priority,
                important: task.important,
                dueAt: task.dueAt,
                estimatedMinutes: task.estimatedMinutes,
                taskListId: "list-2",
                changesTaskListId: true
            )
        )
        let movedTask = try XCTUnwrap(moved.tasks.first(where: { $0.id == task.id }))
        XCTAssertEqual(movedTask.taskListId, "list-2")
        XCTAssertEqual(moved.mutations.last?.payload["taskListId"], .string("list-2"))

        // Moving back to Inbox clears the list explicitly.
        let toInbox = try await store.editTask(
            id: task.id,
            edits: TaskEdits(
                title: "Move me",
                descriptionMarkdown: task.descriptionMarkdown,
                priority: task.priority,
                important: task.important,
                dueAt: task.dueAt,
                estimatedMinutes: task.estimatedMinutes,
                taskListId: nil,
                changesTaskListId: true
            )
        )
        let toInboxTask = try XCTUnwrap(toInbox.tasks.first(where: { $0.id == task.id }))
        XCTAssertNil(toInboxTask.taskListId)
        XCTAssertEqual(toInbox.mutations.last?.payload["taskListId"], .null)
    }

    func testReorderTasksEmitsSortOrderUpdatesInOrder() async throws {
        let store = OfflineStore(accountID: "reorder-tasks-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let (_, firstSnap) = try await store.createTask(title: "A")
        let firstTask = try XCTUnwrap(firstSnap.tasks.first(where: { $0.title == "A" }))
        let (_, secondSnap) = try await store.createTask(title: "B")
        let secondTask = try XCTUnwrap(secondSnap.tasks.first(where: { $0.title == "B" }))
        let (_, thirdSnap) = try await store.createTask(title: "C")
        let thirdTask = try XCTUnwrap(thirdSnap.tasks.first(where: { $0.title == "C" }))
        let ids = [firstTask.id, secondTask.id, thirdTask.id]

        let reordered = try await store.reorderTasks(orderedIds: [ids[2], ids[0], ids[1]])
        let updates = reordered.mutations.filter { $0.kind == "task.update" && $0.payload["sortOrder"] != nil }

        XCTAssertEqual(updates.count, 3)
        XCTAssertEqual(updates[0].entityId, ids[2])
        XCTAssertEqual(updates[0].payload["sortOrder"], .number(1))
        XCTAssertEqual(updates[1].entityId, ids[0])
        XCTAssertEqual(updates[1].payload["sortOrder"], .number(2))
        XCTAssertEqual(updates[2].entityId, ids[1])
        XCTAssertEqual(updates[2].payload["sortOrder"], .number(3))

        let sortedTasks = reordered.tasks.sorted { $0.sortOrder < $1.sortOrder }
        XCTAssertEqual(sortedTasks.map(\.id), [ids[2], ids[0], ids[1]])
    }

    func testHydrationReplaysPendingHabitUpdateOverServerSnapshot() async throws {
        let store = OfflineStore(accountID: "hydration-habit-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let serverHabit = HabitModel(id: "habit-1", name: "Server name", startDate: "2026-08-01T00:00:00Z")
        _ = try await store.updateHabits([serverHabit])

        var localHabit = serverHabit
        localHabit.name = "Local pending name"
        _ = try await store.saveHabit(localHabit)

        let hydrated = try await store.applyHydration(hydrationResources(habits: [serverHabit]))

        XCTAssertEqual(hydrated.habits.first?.name, "Local pending name")
        XCTAssertEqual(hydrated.mutations.last?.kind, "habit.update")
    }

    func testHydrationReplaysPendingHabitCheckInOverServerSnapshot() async throws {
        let store = OfflineStore(accountID: "hydration-habit-checkin-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let serverHabit = HabitModel(id: "habit-checkin-1", name: "Read", startDate: "2026-08-01T00:00:00Z")
        _ = try await store.updateHabits([serverHabit])
        let checkedIn = try await store.toggleHabitCheckIn(id: serverHabit.id)
        XCTAssertTrue(checkedIn.habits.first?.isCompletedToday == true)

        let hydrated = try await store.applyHydration(hydrationResources(habits: [serverHabit]))

        XCTAssertTrue(hydrated.habits.first?.isCompletedToday == true)
        XCTAssertEqual(hydrated.habits.first?.currentStreak, checkedIn.habits.first?.currentStreak)
        XCTAssertEqual(hydrated.habits.first?.totalCompletions, checkedIn.habits.first?.totalCompletions)
    }

    func testHydrationReplaysPendingRewardRedemptionOverServerSnapshot() async throws {
        let store = OfflineStore(accountID: "hydration-growth-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let reward = GrowthRewardDTO(
            id: "reward-1", name: "Coffee", description: "Break", icon: "cup.and.saucer",
            price: 5, repeatable: false, version: 1, archivedAt: nil, listedInShop: true,
            _count: GrowthRedemptionCountDTO(redemptions: 0)
        )
        _ = try await store.updateGrowthOverview(
            GrowthOverviewDTO(account: GrowthAccountDTO(level: 1, currentXp: 0, nextLevelXp: 100, coinBalance: 10), skills: nil, recentLedger: nil)
        )
        _ = try await store.updateGrowthRewards([reward])
        let redeemed = try await store.redeemGrowthReward(id: reward.id)
        XCTAssertEqual(redeemed.userCoins, 5)

        let hydrated = try await store.applyHydration(hydrationResources(
            growth: GrowthOverviewDTO(account: GrowthAccountDTO(level: 1, currentXp: 0, nextLevelXp: 100, coinBalance: 10), skills: nil, recentLedger: nil),
            rewards: [reward],
            inventory: []
        ))

        XCTAssertEqual(hydrated.userCoins, 5)
        XCTAssertEqual(hydrated.shopItems.first?.redemptionCount, 1)
        XCTAssertEqual(hydrated.inventoryItems.first?.quantity, 1)
        XCTAssertEqual(hydrated.mutations.last?.kind, "growthshopreward.redeem")
    }

    func testHydrationDoesNotDoubleDebitPendingRedemptionWhenGrowthOverviewFails() async throws {
        let store = OfflineStore(accountID: "hydration-growth-partial-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        let reward = GrowthRewardDTO(
            id: "reward-partial-1", name: "Coffee", description: "Break", icon: "cup.and.saucer",
            price: 5, repeatable: false, version: 1, archivedAt: nil, listedInShop: true,
            _count: GrowthRedemptionCountDTO(redemptions: 0)
        )
        _ = try await store.updateGrowthOverview(
            GrowthOverviewDTO(account: GrowthAccountDTO(level: 1, currentXp: 0, nextLevelXp: 100, coinBalance: 10), skills: nil, recentLedger: nil)
        )
        _ = try await store.updateGrowthRewards([reward])
        let redeemed = try await store.redeemGrowthReward(id: reward.id)
        XCTAssertEqual(redeemed.userCoins, 5)

        let hydrated = try await store.applyHydration(hydrationResources(
            rewards: [reward],
            inventory: []
        ))

        XCTAssertEqual(hydrated.userCoins, 5)
        XCTAssertEqual(hydrated.shopItems.first?.redemptionCount, 1)
        XCTAssertEqual(hydrated.inventoryItems.first?.quantity, 1)
    }

    func testLoadMigratesLegacyHabitCheckInMutations() async throws {
        let store = OfflineStore(accountID: "migration-test-user", baseURL: temporaryDirectory)
        _ = try await store.load()
        
        let habit = HabitModel(id: "habit-mig-1", name: "Read", startDate: "2026-08-01T00:00:00Z")
        _ = try await store.updateHabits([habit])
        
        let now = ISO8601DateFormatter().string(from: Date())
        let legacyMutation = SyncMutation(
            id: "legacy-mut-1",
            kind: "habit.checkin",
            entityId: habit.id,
            baseVersion: 1,
            payload: [
                "isCompletedToday": .bool(true),
                "occurredAt": .string(now)
            ],
            occurredAt: now
        )
        
        _ = try await store.enqueue(legacyMutation)
        
        let reloadedStore = OfflineStore(accountID: "migration-test-user", baseURL: temporaryDirectory)
        let reloaded = try await reloadedStore.load()
        
        XCTAssertEqual(reloaded.mutations.count, 1)
        let migrated = reloaded.mutations.first!
        XCTAssertEqual(migrated.kind, "habitoccurrence.checkin")
        XCTAssertEqual(migrated.payload["value"]?.numberValue, 1.0)
        
        let occurrenceId = migrated.entityId
        let occurrence = reloaded.habitOccurrences.first(where: { $0.id == occurrenceId })
        XCTAssertNotNil(occurrence)
        XCTAssertEqual(occurrence?.habitId, habit.id)
        XCTAssertEqual(occurrence?.status, .completed)
    }

    private func hydrationResources(
        habits: [HabitModel]? = nil,
        growth: GrowthOverviewDTO? = nil,
        rewards: [GrowthRewardDTO]? = nil,
        inventory: [GrowthInventoryDTO]? = nil,
        decks: [DeckModel]? = nil
    ) -> AccountHydrationResources {
        AccountHydrationResources(
            tasks: nil,
            lists: nil,
            sections: nil,
            tags: nil,
            metadata: nil,
            habits: habits,
            growth: growth,
            skills: nil,
            attributes: nil,
            rewards: rewards,
            inventory: inventory,
            ledger: nil,
            decks: decks,
            cards: [:],
            profile: nil,
            presets: nil,
            taskRules: nil,
            habitRules: nil,
            rewardDefaults: nil,
            mappings: nil
        )
    }

    private func makeFocusSession() -> FocusSession {
        FocusSession.optimistic(
            id: ULID.generate(),
            task: nil,
            phase: .work,
            plannedSeconds: 1_800,
            startedAt: "2026-07-31T00:00:00Z"
        )
    }
}
