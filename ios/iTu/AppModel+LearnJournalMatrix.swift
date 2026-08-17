import Foundation
import iTuDomain
import iTuNetworking
import iTuOffline
import iTuSync

enum IOSStudyGrade: String, CaseIterable, Identifiable, Sendable {
    case again = "AGAIN"
    case hard = "HARD"
    case good = "GOOD"
    case easy = "EASY"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .again: "Again"
        case .hard: "Hard"
        case .good: "Good"
        case .easy: "Easy"
        }
    }

    var systemImage: String {
        switch self {
        case .again: "arrow.counterclockwise"
        case .hard: "tortoise"
        case .good: "checkmark"
        case .easy: "checkmark.seal"
        }
    }
}

enum IOSMatrixQuadrant: String, CaseIterable, Identifiable, Sendable {
    case q1
    case q2
    case q3
    case q4

    var id: String { rawValue }

    var title: String {
        switch self {
        case .q1: "Do now"
        case .q2: "Schedule"
        case .q3: "Delegate or minimize"
        case .q4: "Eliminate"
        }
    }

    var subtitle: String {
        switch self {
        case .q1: "Important and urgent"
        case .q2: "Important, not urgent"
        case .q3: "Not important, urgent"
        case .q4: "Not important, not urgent"
        }
    }

    var isImportant: Bool { self == .q1 || self == .q2 }
    var isUrgent: Bool { self == .q1 || self == .q3 }

    static func classify(_ task: ProductivityTask, now: Date = Date()) -> Self {
        let important = task.important || task.priority == .high
        let urgent: Bool
        if let override = task.urgentOverride {
            urgent = override
        } else if task.priority == .high {
            urgent = true
        } else if let dueAt = task.dueAt,
                  let dueDate = IOSProductCalendar.date(from: dueAt) {
            urgent = dueDate <= now.addingTimeInterval(2 * 86_400)
        } else {
            urgent = false
        }
        switch (important, urgent) {
        case (true, true): return .q1
        case (true, false): return .q2
        case (false, true): return .q3
        case (false, false): return .q4
        }
    }
}

@MainActor
extension AppModel {
    // MARK: Learn

    @discardableResult
    func refreshLearn() async -> Bool {
        let client = apiClient
        guard let context = phase6OperationContext() else { return false }
        return await performOfflineMutation { [weak self] store in
            guard let self, await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            let fetchedDecks = try await client.fetchDecks()
            guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            var fetchedCards: [String: [CardModel]] = [:]
            for deck in fetchedDecks {
                let cards = try? await client.fetchCards(deckId: deck.id)
                guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
                if let cards {
                    fetchedCards[deck.id] = cards
                }
            }
            guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            var snapshot = try await store.updateDecks(fetchedDecks)
            guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            for (deckID, cards) in fetchedCards {
                snapshot = try await store.updateCards(deckId: deckID, cards: cards)
                guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            }
            return snapshot
        }
    }

    @discardableResult
    func createDeck(title: String, description: String) async -> Bool {
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return false }
        return await performOfflineMutation { store in
            let result = try await store.createDeck(title: title, description: description)
            return result.snapshot
        }
    }

    @discardableResult
    func deleteDeck(id: String) async -> Bool {
        await performOfflineMutation { store in
            try await store.deleteDeck(id: id)
        }
    }

    @discardableResult
    func loadCards(for deck: DeckModel) async -> Bool {
        let client = apiClient
        guard let context = phase6OperationContext() else { return false }
        return await performOfflineMutation { [weak self] store in
            guard let self, await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            let cards = try await client.fetchCards(deckId: deck.id)
            guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            let snapshot = try await store.updateCards(deckId: deck.id, cards: cards)
            guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            return snapshot
        }
    }

    @discardableResult
    func loadDueCards(for deck: DeckModel) async -> Bool {
        let client = apiClient
        guard let context = phase6OperationContext() else { return false }
        return await performOfflineMutation { [weak self] store in
            guard let self, await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            let cards = try await client.fetchDueCards(deckId: deck.id)
            guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            let snapshot = try await store.updateCards(deckId: deck.id, cards: cards)
            guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            return snapshot
        }
    }

    @discardableResult
    func createCard(deckId: String, frontMarkdown: String, backMarkdown: String) async -> Bool {
        guard !frontMarkdown.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        return await performOfflineMutation { store in
            let result = try await store.createCard(deckId: deckId, frontMarkdown: frontMarkdown, backMarkdown: backMarkdown)
            return result.snapshot
        }
    }

    @discardableResult
    func updateCard(id: String, frontMarkdown: String, backMarkdown: String) async -> Bool {
        await performOfflineMutation { store in
            try await store.updateCard(id: id, frontMarkdown: frontMarkdown, backMarkdown: backMarkdown)
        }
    }

    @discardableResult
    func deleteCard(id: String) async -> Bool {
        await performOfflineMutation { store in
            try await store.deleteCard(id: id)
        }
    }

    func startStudySession(deckId: String, mode: String = "DUE") async -> String? {
        let sessionID = ULID.generate()
        let now = Self.iosNow()
        let created = await performOfflineMutation { store in
            await store.appendMutation(SyncMutation(
                id: ULID.generate(), kind: "session.start", entityId: sessionID,
                payload: ["deckId": .string(deckId), "mode": .string(mode)], occurredAt: now
            ))
            try await store.persist()
            return await store.snapshot()
        }
        return created ? sessionID : nil
    }

    @discardableResult
    func submitReview(
        sessionId: String,
        cardId: String,
        grade: String,
        direction: String = "FRONT_TO_BACK"
    ) async -> Bool {
        await performOfflineMutation { store in
            try await store.submitReview(
                sessionId: sessionId,
                cardId: cardId,
                grade: grade,
                direction: direction,
                idempotencyKey: ULID.generate()
            )
        }
    }

    @discardableResult
    func completeStudySession(sessionId: String, rating: Int) async -> Bool {
        await performOfflineMutation { store in
            try await store.completeStudySession(sessionId: sessionId, rating: rating)
        }
    }

    // MARK: Journal

    @discardableResult
    func refreshJournal() async -> Bool {
        let client = apiClient
        guard let context = phase6OperationContext() else { return false }
        return await performOfflineMutation { [weak self] store in
            guard let self, await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            let notes = try await client.getJournalNotes()
            guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            let tags = try? await client.getJournalTags()
            guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            var snapshot = try await store.replaceJournalNotes(notes)
            guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            if let tags {
                for tag in tags {
                    snapshot = try await store.replaceJournalTag(tag)
                    guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
                }
            }
            return snapshot
        }
    }

    func deleteJournalNote(id: String) async {
        guard let source = journalNotes.first(where: { $0.id == id }), Self.canEditJournalNote(source) else { return }
        var deleted = source
        let now = Self.iosNow()
        deleted.deletedAt = now
        deleted.updatedAt = now
        deleted.version += 1
        let value = deleted
        _ = await performOfflineMutation { store in
            try await store.saveJournalNote(
                value,
                mutation: SyncMutation(
                    id: ULID.generate(),
                    kind: "journal.delete",
                    entityId: id,
                    baseVersion: source.version,
                    payload: [:],
                    occurredAt: now
                )
            )
        }
    }

    @discardableResult
    func saveJournalEntry(
        id: String?,
        title: String,
        contentMarkdown: String,
        entryDate: String,
        tagIds: [String] = [],
        templateId: String? = nil,
        kind: String? = nil,
        dailyReview: JournalDailyReviewModel? = nil,
        weeklyReview: JournalWeeklyReviewModel? = nil
    ) async -> Bool {
        let normalizedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedBody = contentMarkdown.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedTitle.isEmpty || !normalizedBody.isEmpty else { return false }
        let normalizedDate = String(entryDate.prefix(10))
        guard IOSProductCalendar.date(from: normalizedDate) != nil else { return false }
        let existing = id.flatMap { noteID in journalNotes.first(where: { $0.id == noteID }) }
        let editingReview = (dailyReview != nil && existing?.dailyReview != nil) || (weeklyReview != nil && existing?.weeklyReview != nil)
        guard (existing.map { Self.canEditJournalNote($0) || editingReview } ?? true),
              let accountID = user?.id else { return false }
        let now = Self.iosNow()
        let note = JournalNoteModel(
            id: id ?? ULID.generate(), userId: accountID, kind: kind ?? existing?.kind ?? "NOTE",
            title: normalizedTitle, contentMarkdown: contentMarkdown,
            entryDate: normalizedDate, updatedAt: now,
            timezone: existing?.timezone ?? iTuCalendarSupport.timezone.identifier,
            templateId: templateId ?? existing?.templateId, tagIds: tagIds,
            version: existing?.version ?? 1, createdAt: existing?.createdAt ?? now,
            deletedAt: nil, weeklyReview: weeklyReview ?? existing?.weeklyReview, dailyReview: dailyReview ?? existing?.dailyReview,
            tags: existing?.tags ?? [], attachments: existing?.attachments ?? [],
            contextType: existing?.contextType, contextId: existing?.contextId, contextData: existing?.contextData
        )
        var payload: [String: JSONValue] = [
            "title": .string(note.title), "contentMarkdown": .string(note.contentMarkdown),
            "entryDate": .string(note.entryDate), "timezone": .string(note.timezone),
            "tagIds": .array(note.tagIds.map(JSONValue.string))
        ]
        if let templateId = note.templateId { payload["templateId"] = .string(templateId) }
        if let review = note.weeklyReview {
            payload["weeklyReview"] = .object([
                "periodStart": .string(review.periodStart), "periodEnd": .string(review.periodEnd),
                "summarySnapshot": .object(review.summarySnapshot),
                "wentWellMarkdown": .string(review.wentWellMarkdown ?? ""),
                "frictionMarkdown": .string(review.frictionMarkdown ?? ""),
                "learnedMarkdown": .string(review.learnedMarkdown ?? ""),
                "differentFromLastWeekMarkdown": .string(review.differentFromLastWeekMarkdown ?? ""),
                "nextWeekMarkdown": .string(review.nextWeekMarkdown ?? "")
            ])
        }
        if let review = note.dailyReview {
            payload["dailyReview"] = .object([
                "periodDate": .string(review.periodDate), "summarySnapshot": .object(review.summarySnapshot),
                "wentWellMarkdown": .string(review.wentWellMarkdown ?? ""),
                "frictionMarkdown": .string(review.frictionMarkdown ?? ""),
                "learnedMarkdown": .string(review.learnedMarkdown ?? ""),
                "contextMarkdown": .string(review.contextMarkdown ?? "")
            ])
        }
        if existing == nil {
            payload["id"] = .string(note.id)
            payload["kind"] = .string(note.kind)
        }
        let mutationPayload = payload
        return await performOfflineMutation { store in
            try await store.saveJournalNote(
                note,
                mutation: SyncMutation(
                    id: ULID.generate(), kind: existing == nil ? "journal.create" : "journal.update",
                    entityId: note.id, baseVersion: existing?.version, payload: mutationPayload, occurredAt: now
                )
            )
        }
    }

    @discardableResult
    func saveDailyReview(
        date: String,
        wentWell: String,
        friction: String,
        learned: String,
        context: String,
        summarySnapshot: [String: JSONValue]
    ) async -> JournalNoteModel? {
        let date = String(date.prefix(10))
        let existing = journalNotes.first { $0.dailyReview?.periodDate == date }
        let noteID = existing?.id ?? ULID.generate()
        let review = JournalDailyReviewModel(
            entryId: noteID, periodDate: date, summarySnapshot: summarySnapshot,
            wentWellMarkdown: wentWell.nilIfBlank, frictionMarkdown: friction.nilIfBlank,
            learnedMarkdown: learned.nilIfBlank, contextMarkdown: context.nilIfBlank
        )
        let content = """
        # Daily Review: \(date)

        ### What went well
        \(wentWell)

        ### Friction & Challenges
        \(friction)

        ### What was learned
        \(learned)

        ### Context & qualitative notes
        \(context)
        """
        guard await saveJournalEntry(
            id: noteID, title: "Daily Review — \(date)", contentMarkdown: content,
            entryDate: date, tagIds: existing?.tagIds ?? [], kind: "DAILY_REVIEW", dailyReview: review
        ) else { return nil }
        return journalNotes.first { $0.id == noteID }
    }

    @discardableResult
    func saveWeeklyReview(
        periodStart: String,
        periodEnd: String,
        wentWell: String,
        friction: String,
        learned: String,
        different: String,
        nextWeek: String,
        summarySnapshot: [String: JSONValue]
    ) async -> JournalNoteModel? {
        let start = String(periodStart.prefix(10))
        let end = String(periodEnd.prefix(10))
        let existing = journalNotes.first { $0.weeklyReview?.periodStart == start }
        let noteID = existing?.id ?? ULID.generate()
        let review = JournalWeeklyReviewModel(
            entryId: noteID, periodStart: start, periodEnd: end, summarySnapshot: summarySnapshot,
            wentWellMarkdown: wentWell.nilIfBlank, frictionMarkdown: friction.nilIfBlank,
            learnedMarkdown: learned.nilIfBlank, differentFromLastWeekMarkdown: different.nilIfBlank,
            nextWeekMarkdown: nextWeek.nilIfBlank
        )
        let content = """
        # Weekly Review: \(start) to \(end)

        ### What went well
        \(wentWell)

        ### Friction
        \(friction)

        ### Lessons learned
        \(learned)

        ### What felt different
        \(different)

        ### Next week focus
        \(nextWeek)
        """
        guard await saveJournalEntry(
            id: noteID, title: "Weekly Review — \(start)", contentMarkdown: content,
            entryDate: end, tagIds: existing?.tagIds ?? [], kind: "WEEKLY_REVIEW", weeklyReview: review
        ) else { return nil }
        return journalNotes.first { $0.id == noteID }
    }

    func loadJournalDailySummary(date: String) async -> [String: JSONValue]? {
        do { return try await apiClient.getJournalDailySummary(date: date, timezone: iTuCalendarSupport.timezone.identifier) }
        catch { setFeatureError("Daily review context unavailable: \(error.localizedDescription)"); return nil }
    }

    func loadJournalWeeklySummary(periodStart: String, periodEnd: String) async -> [String: JSONValue]? {
        do {
            return try await apiClient.getJournalWeeklySummary(
                periodStart: periodStart, periodEnd: periodEnd, timezone: iTuCalendarSupport.timezone.identifier
            )
        } catch {
            setFeatureError("Weekly review context unavailable: \(error.localizedDescription)")
            return nil
        }
    }

    func generateReviewInsights(entryID: String) async -> String? {
        guard isOnline else { return "AI insights require an internet connection." }
        guard let context = phase6OperationContext() else { return "Review storage is unavailable." }
        do {
            let note = try await apiClient.generateReviewInsights(entryID: entryID)
            guard isCurrentPhase6Operation(context) else { return "The account changed while insights were generating." }
            apply(try await context.store.replaceJournalNote(note))
            return nil
        } catch {
            let message = error.localizedDescription
            setFeatureError(message)
            return message
        }
    }

    func createJournalTag(name: String, color: String = "#74D5B2") async {
        guard let accountID = user?.id else { return }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let now = Self.iosNow()
        let tag = JournalTagModel(id: ULID.generate(), userId: accountID, name: trimmed, color: color, createdAt: now, updatedAt: now)
        _ = await performOfflineMutation { store in
            try await store.saveJournalTag(tag, mutation: SyncMutation(
                id: ULID.generate(), kind: "journal_tag.create", entityId: tag.id,
                payload: ["name": .string(tag.name), "color": .string(tag.color)], occurredAt: now
            ))
        }
    }

    func saveJournalTemplate(_ template: JournalTemplateModel) async {
        let now = Self.iosNow()
        let existing = journalTemplates.first(where: { $0.id == template.id })
        _ = await performOfflineMutation { store in
            try await store.saveJournalTemplate(template, mutation: SyncMutation(
                id: ULID.generate(), kind: existing == nil ? "journal_template.create" : "journal_template.update", entityId: template.id,
                baseVersion: existing?.version,
                payload: [
                    "id": .string(template.id),
                    "name": .string(template.name), "entryKind": .string(template.entryKind),
                    "titleTemplate": .string(template.titleTemplate), "bodyMarkdown": .string(template.bodyMarkdown),
                    "defaults": .object(template.defaults), "builtIn": .bool(template.builtIn)
                ], occurredAt: now
            ))
        }
    }

    func deleteJournalTemplate(id: String) async {
        guard let template = journalTemplates.first(where: { $0.id == id }) else { return }
        var archived = template
        let now = Self.iosNow()
        archived.archivedAt = now
        archived.version += 1
        let value = archived
        _ = await performOfflineMutation { store in
            try await store.saveJournalTemplate(value, mutation: SyncMutation(
                id: ULID.generate(), kind: "journal_template.delete", entityId: id,
                baseVersion: template.version, payload: [:], occurredAt: now
            ))
        }
    }

    @discardableResult
    func loadJournalRevisions(entryID: String) async -> Bool {
        let client = apiClient
        guard let context = phase6OperationContext() else { return false }
        return await performOfflineMutation { [weak self] store in
            guard let self, await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            let revisions = try await client.getJournalRevisions(entryID: entryID)
            guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            let snapshot = try await store.replaceJournalRevisions(entryID: entryID, values: revisions)
            guard await self.isCurrentPhase6Operation(context) else { throw CancellationError() }
            return snapshot
        }
    }

    @discardableResult
    func restoreJournalRevision(entryID: String, revisionID: String) async -> Bool {
        guard let revision = journalRevisionsByEntryID[entryID]?.first(where: { $0.id == revisionID }),
              var note = journalNotes.first(where: { $0.id == entryID }),
              Self.canEditJournalNote(note) else { return false }
        if let value = revision.snapshot["title"]?.stringValue { note.title = value }
        if let value = revision.snapshot["contentMarkdown"]?.stringValue { note.contentMarkdown = value }
        if let value = revision.snapshot["entryDate"]?.stringValue { note.entryDate = value }
        let now = Self.iosNow()
        var payload = revision.snapshot
        payload["entryId"] = .string(entryID)
        payload["revisionId"] = .string(revisionID)
        let restoredNote = note
        let revisionPayload = payload
        return await performOfflineMutation { store in
            try await store.saveJournalNote(restoredNote, mutation: SyncMutation(
                id: ULID.generate(), kind: "journal_revision.restore", entityId: revision.id,
                baseVersion: restoredNote.version, payload: revisionPayload, occurredAt: now
            ))
        }
    }

    func queueJournalAttachment(id: String, data: Data, entryId: String, fileName: String, mimeType: String) async {
        _ = await performOfflineMutation { store in
            try await store.queueJournalAttachment(id: id, data: data, entryId: entryId, fileName: fileName, mimeType: mimeType)
        }
    }

    @discardableResult
    func uploadPendingJournalAttachments() async -> Bool {
        guard isOnline, let context = phase6OperationContext() else { return false }
        let snapshot = await context.store.snapshot()
        var succeeded = true

        for (id, data) in snapshot.pendingJournalAttachments {
            guard isCurrentPhase6Operation(context) else { return false }
            guard let metadata = snapshot.pendingJournalAttachmentMetadata[id], !metadata.entryId.isEmpty else {
                succeeded = false
                let message = "Attachment \(id) is missing its Journal entry."
                setFeatureError(message)
                continue
            }

            do {
                let attachment = try await apiClient.uploadJournalAttachment(
                    entryID: metadata.entryId,
                    fileData: data,
                    fileName: metadata.fileName,
                    mimeType: metadata.mimeType,
                    attachmentID: id
                )
                guard isCurrentPhase6Operation(context) else { return false }
                guard var note = (await context.store.snapshot()).journalNotes.first(where: { $0.id == metadata.entryId }) else {
                    succeeded = false
                    setFeatureError("Attachment \(id) has no cached Journal entry.")
                    continue
                }
                note.attachments.removeAll { $0.id == attachment.id }
                note.attachments.append(attachment)
                apply(try await context.store.replaceJournalNote(note))
                apply(try await context.store.removeJournalAttachment(id: id))
            } catch {
                succeeded = false
                recordSyncError("Attachment upload failed", error)
            }
        }
        return succeeded
    }

    func deleteJournalAttachment(entryID: String, attachmentID: String) async {
        let now = Self.iosNow()
        _ = await performOfflineMutation { store in
            try await store.deleteJournalAttachment(
                entryID: entryID, attachmentID: attachmentID,
                mutation: SyncMutation(
                    id: ULID.generate(), kind: "journal_attachment.delete", entityId: attachmentID,
                    payload: ["entryId": .string(entryID)], occurredAt: now
                )
            )
        }
    }

    // MARK: Matrix

    func matrixTasks(query: String = "") -> [IOSMatrixQuadrant: [ProductivityTask]] {
        let normalized = query.trimmingCharacters(in: .whitespacesAndNewlines)
        var result = Dictionary(uniqueKeysWithValues: IOSMatrixQuadrant.allCases.map { ($0, [ProductivityTask]()) })
        for task in tasks where task.deletedAt == nil && task.status != .archived {
            guard normalized.isEmpty || task.title.localizedCaseInsensitiveContains(normalized) else { continue }
            result[IOSMatrixQuadrant.classify(task), default: []].append(task)
        }
        for quadrant in IOSMatrixQuadrant.allCases {
            result[quadrant]?.sort { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        }
        return result
    }

    func reassignTask(_ task: ProductivityTask, to quadrant: IOSMatrixQuadrant) async {
        let allTasks = tasks
        let now = Self.iosNow()
        var changed = task
        changed.important = quadrant.isImportant
        changed.urgentOverride = quadrant.isUrgent
        changed.urgent = quadrant.isUrgent
        changed.urgencyReason = "Set from Eisenhower Matrix"
        changed.version += 1
        let changedTask = changed
        _ = await performOfflineMutation { store in
            _ = try await store.updateTasks(allTasks.map { $0.id == task.id ? changedTask : $0 })
            await store.appendMutation(SyncMutation(
                id: ULID.generate(), kind: "task.update", entityId: task.id, baseVersion: task.version,
                baseValues: ["important": .bool(task.important), "urgentOverride": task.urgentOverride.map(JSONValue.bool) ?? .null],
                payload: ["important": .bool(quadrant.isImportant), "urgentOverride": .bool(quadrant.isUrgent)],
                occurredAt: now
            ))
            try await store.persist()
            return await store.snapshot()
        }
    }

    private static func iosNow() -> String {
        ISO8601DateFormatter().string(from: Date())
    }
}

private extension String {
    var nilIfBlank: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}
