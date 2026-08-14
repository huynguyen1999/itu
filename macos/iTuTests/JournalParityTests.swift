import XCTest
@testable import iTu

final class JournalParityTests: XCTestCase {
    func testDailyReviewDecodesAndPersistsSeparatelyFromWeeklyReview() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let daily = JournalDailyReviewModel(entryId: "daily-1", periodDate: "2026-08-13", summarySnapshot: [:], wentWellMarkdown: "win", frictionMarkdown: nil, learnedMarkdown: "lesson", contextMarkdown: nil, aiInsightsSnapshot: .object(["headline": .string("A day")]), aiGenerationJobId: "job-1", aiGeneratedAt: nil, aiPromptVersion: "review-insights-v1", aiSourceEntryVersion: 1)
        let note = JournalNoteModel(id: "daily-1", userId: "user", kind: "DAILY_REVIEW", title: "Daily review", contentMarkdown: "", entryDate: "2026-08-13", updatedAt: "2026-08-13T00:00:00Z", dailyReview: daily)
        let store = OfflineStore(accountID: "daily-review", baseURL: directory)
        _ = try await store.saveJournalNote(note, mutation: SyncMutation(id: "daily-create", kind: "journal.create", entityId: note.id, baseVersion: nil, baseValues: nil, payload: [:], occurredAt: note.updatedAt, attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil))
        let reloaded = try await OfflineStore(accountID: "daily-review", baseURL: directory).load()
        XCTAssertEqual(reloaded.journalNotes.first?.kind, "DAILY_REVIEW")
        XCTAssertEqual(reloaded.journalNotes.first?.dailyReview?.aiGenerationJobId, "job-1")
        XCTAssertEqual(reloaded.journalNotes.first?.weeklyReview, nil)
    }
    func testJournalWeekRangeUsesHCMCAndWeekStartPreference() {
        let calendar = iTuCalendarSupport.calendar()
        let date = calendar.date(from: DateComponents(year: 2026, month: 8, day: 9, hour: 23))!
        XCTAssertEqual(iTuCalendarSupport.weekRange(containing: date, weekStartDay: "MONDAY").start, "2026-08-03")
        XCTAssertEqual(iTuCalendarSupport.weekRange(containing: date, weekStartDay: "MONDAY").end, "2026-08-09")
        XCTAssertEqual(iTuCalendarSupport.weekRange(containing: date, weekStartDay: "SUNDAY").start, "2026-08-09")
        XCTAssertEqual(iTuCalendarSupport.weekRange(containing: date, weekStartDay: "SUNDAY").end, "2026-08-15")
    }

    func testJournalNoteWritePersistsOptimisticSnapshotAndOutbox() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "journal-parity", baseURL: directory)
        let note = JournalNoteModel(id: "note-1", userId: "user", title: "Offline", contentMarkdown: "# hello", entryDate: "2026-08-10", updatedAt: "2026-08-10T00:00:00Z")
        let mutation = SyncMutation(id: "mutation-1", kind: "journal.create", entityId: note.id, baseVersion: nil, baseValues: nil, payload: ["id": .string(note.id), "kind": .string("NOTE"), "title": .string(note.title), "contentMarkdown": .string(note.contentMarkdown), "entryDate": .string(note.entryDate)], occurredAt: note.updatedAt, attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil)
        _ = try await store.saveJournalNote(note, mutation: mutation)

        let reloaded = try await OfflineStore(accountID: "journal-parity", baseURL: directory).load()
        XCTAssertEqual(reloaded.journalNotes.first?.title, "Offline")
        XCTAssertEqual(reloaded.mutations.map(\.kind), ["journal.create"])
    }

    func testJournalTrashRestoreAndSyncChangeRoundTrip() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "journal-trash", baseURL: directory)
        let note = JournalNoteModel(id: "note-2", userId: "user", kind: "WEEKLY_REVIEW", title: "Review", contentMarkdown: "body", entryDate: "2026-08-10", updatedAt: "2026-08-10T00:00:00Z")
        let create = SyncMutation(id: "mutation-create", kind: "journal.create", entityId: note.id, baseVersion: nil, baseValues: nil, payload: [:], occurredAt: note.updatedAt, attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil)
        _ = try await store.saveJournalNote(note, mutation: create)
        var deleted = note; deleted.deletedAt = "2026-08-10T01:00:00Z"
        let remove = SyncMutation(id: "mutation-delete", kind: "journal.delete", entityId: note.id, baseVersion: 1, baseValues: nil, payload: [:], occurredAt: deleted.deletedAt!, attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil)
        _ = try await store.saveJournalNote(deleted, mutation: remove)
        let deletedSnapshot = await store.snapshot()
        XCTAssertEqual(deletedSnapshot.journalNotes.first?.deletedAt, "2026-08-10T01:00:00Z")

        _ = try await store.applySync(acknowledgedMutationIds: ["mutation-create", "mutation-delete"], conflicts: [], changes: [SyncChange(cursor: 1, entityType: "journalentry", entityId: note.id, deleted: false, data: .object(["id": .string(note.id), "userId": .string("user"), "kind": .string("WEEKLY_REVIEW"), "title": .string("Restored"), "contentMarkdown": .string("body"), "entryDate": .string(note.entryDate), "updatedAt": .string(note.updatedAt)]), complete: true)], cursor: "1")
        let syncedSnapshot = await store.snapshot()
        XCTAssertEqual(syncedSnapshot.journalNotes.first?.title, "Restored")
    }

    func testJournalTagCreatePersistsOutboxAndReconcilesPulledTag() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "journal-tag", baseURL: directory)
        let tag = JournalTagModel(id: "tag-1", userId: "user", name: "Ideas", color: "#74D5B2", createdAt: "2026-08-10T00:00:00Z", updatedAt: "2026-08-10T00:00:00Z")
        let mutation = SyncMutation(id: "tag-mutation", kind: "journal_tag.create", entityId: tag.id, baseVersion: nil, baseValues: nil, payload: ["name": .string(tag.name), "color": .string(tag.color)], occurredAt: tag.createdAt, attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil)
        _ = try await store.saveJournalTag(tag, mutation: mutation)

        let reloaded = try await OfflineStore(accountID: "journal-tag", baseURL: directory).load()
        XCTAssertEqual(reloaded.journalTags.first?.name, "Ideas")
        XCTAssertEqual(reloaded.mutations.first?.kind, "journal_tag.create")

        let incoming = SyncChange(cursor: 1, entityType: "journaltag", entityId: tag.id, deleted: false, data: .object([
            "id": .string(tag.id),
            "userId": .string("user"),
            "name": .string("Server Ideas"),
            "color": .string("#123456"),
            "createdAt": .string(tag.createdAt),
            "updatedAt": .string(tag.updatedAt)
        ]), complete: true)
        let pendingSnapshot = try await store.applySync(acknowledgedMutationIds: [], conflicts: [], changes: [incoming], cursor: "1")
        XCTAssertEqual(pendingSnapshot.journalTags.first?.name, "Ideas")

        let reconciledSnapshot = try await store.applySync(acknowledgedMutationIds: ["tag-mutation"], conflicts: [], changes: [incoming], cursor: "2")
        XCTAssertEqual(reconciledSnapshot.journalTags.first?.name, "Server Ideas")
        XCTAssertTrue(reconciledSnapshot.mutations.isEmpty)
    }

    func testJournalTagAssignmentReappliesFromOptimisticUpdatePayload() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "journal-tag-assignment", baseURL: directory)
        let note = JournalNoteModel(id: "note-tags", userId: "user", title: "Tagged", contentMarkdown: "body", entryDate: "2026-08-10", updatedAt: "2026-08-10T00:00:00Z")
        _ = try await store.saveJournalNote(note, mutation: SyncMutation(id: "note-create", kind: "journal.create", entityId: note.id, baseVersion: nil, baseValues: nil, payload: [:], occurredAt: note.updatedAt, attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil))
        var updated = note
        updated.tagIds = ["tag-a", "tag-b"]
        _ = try await store.saveJournalNote(updated, mutation: SyncMutation(id: "note-update", kind: "journal.update", entityId: note.id, baseVersion: 1, baseValues: nil, payload: ["tagIds": .array(updated.tagIds.map(JSONValue.string))], occurredAt: "2026-08-10T01:00:00Z", attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil))
        let reloaded = try await OfflineStore(accountID: "journal-tag-assignment", baseURL: directory).load()
        XCTAssertEqual(reloaded.journalNotes.first?.tagIds, ["tag-a", "tag-b"])
    }

    func testWeeklyReviewUpdatePayloadClearsPriorReflectionFields() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "journal-review-clear", baseURL: directory)
        let review = JournalWeeklyReviewModel(entryId: "review-1", periodStart: "2026-08-03", periodEnd: "2026-08-09", summarySnapshot: [:], wentWellMarkdown: "keep", frictionMarkdown: "old friction", nextWeekMarkdown: "old focus", experimentSnapshot: nil)
        let note = JournalNoteModel(id: "review-1", userId: "user", kind: "WEEKLY_REVIEW", title: "Review", contentMarkdown: "keep", entryDate: "2026-08-03", updatedAt: "2026-08-10T00:00:00Z", weeklyReview: review)
        _ = try await store.saveJournalNote(note, mutation: SyncMutation(id: "review-create", kind: "journal.create", entityId: note.id, baseVersion: nil, baseValues: nil, payload: [:], occurredAt: note.updatedAt, attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil))
        let cleared: [String: JSONValue] = ["periodStart": .string("2026-08-03"), "periodEnd": .string("2026-08-09"), "summarySnapshot": .object([:]), "wentWellMarkdown": .string(""), "frictionMarkdown": .string(""), "nextWeekMarkdown": .string("")]
        _ = try await store.saveJournalNote(note, mutation: SyncMutation(id: "review-clear", kind: "journal.update", entityId: note.id, baseVersion: 1, baseValues: nil, payload: ["weeklyReview": .object(cleared)], occurredAt: "2026-08-10T01:00:00Z", attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil))
        let reloaded = try await OfflineStore(accountID: "journal-review-clear", baseURL: directory).load()
        XCTAssertEqual(reloaded.journalNotes.first?.weeklyReview?.wentWellMarkdown, "")
        XCTAssertEqual(reloaded.journalNotes.first?.weeklyReview?.frictionMarkdown, "")
        XCTAssertEqual(reloaded.journalNotes.first?.weeklyReview?.nextWeekMarkdown, "")
    }

    func testAttachmentDeleteOutboxPreservesOtherAttachments() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "journal-attachments-delete", baseURL: directory)
        let first = JournalAttachmentModel(id: "attachment-a", userId: "user", entryId: "note-attachments", fileName: "a.txt", mimeType: "text/plain", sizeBytes: 1, storageKey: "a", url: nil, createdAt: "2026-08-10T00:00:00Z", deletedAt: nil)
        let second = JournalAttachmentModel(id: "attachment-b", userId: "user", entryId: "note-attachments", fileName: "b.txt", mimeType: "text/plain", sizeBytes: 1, storageKey: "b", url: nil, createdAt: "2026-08-10T00:00:00Z", deletedAt: nil)
        let note = JournalNoteModel(id: "note-attachments", userId: "user", title: "Files", contentMarkdown: "body", entryDate: "2026-08-10", updatedAt: "2026-08-10T00:00:00Z", attachments: [first, second])
        _ = try await store.saveJournalNote(note, mutation: SyncMutation(id: "attachments-create", kind: "journal.create", entityId: note.id, baseVersion: nil, baseValues: nil, payload: [:], occurredAt: note.updatedAt, attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil))
        let deletion = SyncMutation(id: "attachment-delete", kind: "journal_attachment.delete", entityId: first.id, baseVersion: nil, baseValues: nil, payload: ["entryId": .string(note.id)], occurredAt: "2026-08-10T01:00:00Z", attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil)
        let snapshot = try await store.deleteJournalAttachment(entryID: note.id, attachmentID: first.id, mutation: deletion)
        XCTAssertEqual(snapshot.journalNotes.first?.attachments.map(\.id), [second.id])
        XCTAssertEqual(snapshot.mutations.last?.kind, "journal_attachment.delete")
    }

    func testJournalAttachmentDeleteChangeRemovesAttachmentAfterOutboxAck() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "journal-attachment-change", baseURL: directory)
        let attachment = JournalAttachmentModel(id: "attachment-change", userId: "user", entryId: "note-change", fileName: "a.txt", mimeType: "text/plain", sizeBytes: 1, storageKey: "a", url: nil, createdAt: "2026-08-10T00:00:00Z", deletedAt: nil)
        let note = JournalNoteModel(id: "note-change", userId: "user", title: "Files", contentMarkdown: "body", entryDate: "2026-08-10", updatedAt: "2026-08-10T00:00:00Z", attachments: [attachment])
        _ = try await store.saveJournalNote(note, mutation: SyncMutation(id: "change-create", kind: "journal.create", entityId: note.id, baseVersion: nil, baseValues: nil, payload: [:], occurredAt: note.updatedAt, attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil))
        let deletion = SyncMutation(id: "change-delete", kind: "journal_attachment.delete", entityId: attachment.id, baseVersion: nil, baseValues: nil, payload: ["entryId": .string(note.id)], occurredAt: "2026-08-10T01:00:00Z", attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil)
        _ = try await store.deleteJournalAttachment(entryID: note.id, attachmentID: attachment.id, mutation: deletion)
        let incoming = SyncChange(cursor: 1, entityType: "journalattachment", entityId: attachment.id, deleted: true, data: nil, complete: true)
        let snapshot = try await store.applySync(acknowledgedMutationIds: ["change-delete"], conflicts: [], changes: [incoming], cursor: "1")
        XCTAssertTrue(snapshot.journalNotes.first?.attachments.isEmpty == true)
    }

    func testJournalRevisionRestoreReappliesOptimisticSnapshotAfterReload() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "journal-revision-restore", baseURL: directory)
        let note = JournalNoteModel(id: "note-revision", userId: "user", title: "Current", contentMarkdown: "current", entryDate: "2026-08-10", updatedAt: "2026-08-10T00:00:00Z", templateId: "template-current", tagIds: ["tag-current"])
        _ = try await store.saveJournalNote(note, mutation: SyncMutation(id: "revision-note-create", kind: "journal.create", entityId: note.id, baseVersion: nil, baseValues: nil, payload: [:], occurredAt: note.updatedAt, attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil))
        let weeklyReview: JSONValue = .object(["periodStart": .string("2026-08-03"), "periodEnd": .string("2026-08-09"), "summarySnapshot": .object([:]), "wentWellMarkdown": .string("restored"), "frictionMarkdown": .string(""), "nextWeekMarkdown": .string("")])
        let restore = SyncMutation(id: "revision-restore", kind: "journal_revision.restore", entityId: "revision-1", baseVersion: 1, baseValues: nil, payload: ["entryId": .string(note.id), "revisionId": .string("revision-1"), "title": .string("Restored"), "contentMarkdown": .string("old content"), "entryDate": .string("2026-08-03"), "timezone": .string("Asia/Ho_Chi_Minh"), "templateId": .string("template-restored"), "tags": .array([.object(["id": .string("tag-restored")])]), "weeklyReview": weeklyReview], occurredAt: "2026-08-10T01:00:00Z", attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil)
        XCTAssertEqual(restore.entityId, "revision-1")
        _ = try await store.saveJournalNote(note, mutation: restore)
        let reloaded = try await OfflineStore(accountID: "journal-revision-restore", baseURL: directory).load()
        XCTAssertEqual(reloaded.journalNotes.first?.title, "Restored")
        XCTAssertEqual(reloaded.journalNotes.first?.templateId, "template-restored")
        XCTAssertEqual(reloaded.journalNotes.first?.tagIds, ["tag-restored"])
        XCTAssertEqual(reloaded.journalNotes.first?.weeklyReview?.wentWellMarkdown, "restored")

        let cleared = reloaded.journalNotes[0]
        let clearRestore = SyncMutation(id: "revision-clear", kind: "journal_revision.restore", entityId: "revision-2", baseVersion: cleared.version, baseValues: nil, payload: ["entryId": .string(note.id), "revisionId": .string("revision-2"), "templateId": .null, "tags": .array([])], occurredAt: "2026-08-10T02:00:00Z", attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil)
        _ = try await OfflineStore(accountID: "journal-revision-restore", baseURL: directory).saveJournalNote(cleared, mutation: clearRestore)
        let clearedReload = try await OfflineStore(accountID: "journal-revision-restore", baseURL: directory).load()
        XCTAssertNil(clearedReload.journalNotes.first?.templateId)
        XCTAssertEqual(clearedReload.journalNotes.first?.tagIds, [])
    }

    func testJournalAttachmentUploaderUsesMultipartAndRetainsQueueOnFailure() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "journal-attachment", baseURL: directory)
        _ = try await store.queueJournalAttachment(id: "att-1", data: Data("bytes".utf8), entryId: "entry-1", fileName: "note.txt", mimeType: "text/plain")
        let queued = await store.snapshot()
        XCTAssertEqual(queued.pendingJournalAttachmentMetadata["att-1"]?.entryId, "entry-1")

        JournalUploadURLProtocol.statusCode = 500
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [JournalUploadURLProtocol.self]
        let client = APIClient(session: URLSession(configuration: config))
        do {
            _ = try await client.uploadJournalAttachment(entryID: "entry-1", fileData: Data("bytes".utf8), fileName: "note.txt", mimeType: "text/plain")
            XCTFail("expected upload failure")
        } catch {}
        XCTAssertEqual(JournalUploadURLProtocol.lastPath, "/journal/attachments/upload")
        XCTAssertEqual(JournalUploadURLProtocol.lastMethod, "POST")
        XCTAssertTrue(JournalUploadURLProtocol.lastContentType?.hasPrefix("multipart/form-data; boundary=") == true)
        let retained = await store.snapshot()
        XCTAssertTrue(retained.pendingJournalAttachments["att-1"] != nil)
    }

    func testDailyNoteTrashAndRestoreOfflineSnapshot() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "daily-note-trash", baseURL: directory)
        let note = JournalNoteModel(
            id: "daily-note-1",
            userId: "user",
            kind: "NOTE",
            title: "Daily Note: 2026-08-14",
            contentMarkdown: "## Notes\n- task 1",
            entryDate: "2026-08-14",
            updatedAt: "2026-08-14T10:00:00Z"
        )
        let create = SyncMutation(id: "create-mut", kind: "journal.create", entityId: note.id, baseVersion: nil, baseValues: nil, payload: [:], occurredAt: note.updatedAt, attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil)
        _ = try await store.saveJournalNote(note, mutation: create)

        var deleted = note
        deleted.deletedAt = "2026-08-14T11:00:00Z"
        deleted.version = note.version + 1
        let deleteMutation = SyncMutation(id: "del-mut", kind: "journal.delete", entityId: note.id, baseVersion: note.version, baseValues: nil, payload: [:], occurredAt: deleted.deletedAt!, attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil)
        let deletedSnapshot = try await store.saveJournalNote(deleted, mutation: deleteMutation)

        XCTAssertEqual(deletedSnapshot.journalNotes.first?.deletedAt, "2026-08-14T11:00:00Z")
        XCTAssertEqual(deletedSnapshot.mutations.map(\.kind), ["journal.create", "journal.delete"])

        var restored = deleted
        restored.deletedAt = nil
        restored.version = deleted.version + 1
        let restoreMutation = SyncMutation(id: "res-mut", kind: "journal.restore", entityId: note.id, baseVersion: deleted.version, baseValues: nil, payload: ["deletedAt": .null], occurredAt: "2026-08-14T12:00:00Z", attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil)
        let restoredSnapshot = try await store.saveJournalNote(restored, mutation: restoreMutation)

        XCTAssertNil(restoredSnapshot.journalNotes.first?.deletedAt)
        XCTAssertEqual(restoredSnapshot.mutations.map(\.kind), ["journal.create", "journal.delete", "journal.restore"])
    }
}

private final class JournalUploadURLProtocol: URLProtocol {
    nonisolated(unsafe) static var statusCode = 200
    nonisolated(unsafe) static var lastPath: String?
    nonisolated(unsafe) static var lastMethod: String?
    nonisolated(unsafe) static var lastBody: Data?
    nonisolated(unsafe) static var lastContentType: String?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lastPath = request.url?.path
        Self.lastMethod = request.httpMethod
        Self.lastBody = request.httpBody
        Self.lastContentType = request.value(forHTTPHeaderField: "Content-Type")
        let response = HTTPURLResponse(url: request.url!, statusCode: Self.statusCode, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.statusCode >= 200 && Self.statusCode < 300 ? Data("{}".utf8) : Data("{\"message\":\"failed\"}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
