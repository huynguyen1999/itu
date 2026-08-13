import Foundation

extension OfflineStore {
    @discardableResult
    func replaceJournalNotes(_ values: [JournalNoteModel]) throws -> OfflineSnapshot {
        let pendingIDs = Set(state.mutations.filter { $0.kind.hasPrefix("journal.") }.map(\.entityId))
        state.journalNotes = values + state.journalNotes.filter { existing in
            pendingIDs.contains(existing.id) && !values.contains(where: { fetched in fetched.id == existing.id })
        }
        reapplyPendingJournalMutations()
        try persist()
        return state
    }

    @discardableResult
    func saveJournalNote(_ value: JournalNoteModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        upsert(&state.journalNotes, value)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func replaceJournalNote(_ value: JournalNoteModel) throws -> OfflineSnapshot {
        upsert(&state.journalNotes, value)
        try persist()
        return state
    }

    @discardableResult
    func permanentlyRemoveJournalNote(id: String) throws -> OfflineSnapshot {
        state.journalNotes.removeAll { $0.id == id }
        state.mutations.removeAll { $0.entityId == id && ($0.kind == "journal.delete" || $0.kind == "journal.restore") }
        try persist()
        return state
    }

    @discardableResult
    func saveJournalTemplate(_ value: JournalTemplateModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        upsert(&state.journalTemplates, value)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func saveJournalTag(_ value: JournalTagModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        upsert(&state.journalTags, value)
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func replaceJournalTag(_ value: JournalTagModel) throws -> OfflineSnapshot {
        upsert(&state.journalTags, value)
        try persist()
        return state
    }

    @discardableResult
    func saveJournalPreferences(_ value: JournalPreferencesModel, mutation: SyncMutation) throws -> OfflineSnapshot {
        state.journalPreferences = value
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func queueJournalAttachment(id: String, data: Data, entryId: String = "", fileName: String = "attachment", mimeType: String = "application/octet-stream") throws -> OfflineSnapshot {
        state.pendingJournalAttachments[id] = data
        state.pendingJournalAttachmentMetadata[id] = JournalPendingAttachment(entryId: entryId, fileName: fileName, mimeType: mimeType)
        try persist()
        return state
    }

    @discardableResult
    func removeJournalAttachment(id: String) throws -> OfflineSnapshot {
        state.pendingJournalAttachments.removeValue(forKey: id)
        state.pendingJournalAttachmentMetadata.removeValue(forKey: id)
        try persist()
        return state
    }

    @discardableResult
    func removeJournalAttachment(entryID: String, attachmentID: String) throws -> OfflineSnapshot {
        guard let index = state.journalNotes.firstIndex(where: { $0.id == entryID }) else { return state }
        state.journalNotes[index].attachments.removeAll { $0.id == attachmentID }
        try persist()
        return state
    }

    @discardableResult
    func deleteJournalAttachment(entryID: String, attachmentID: String, mutation: SyncMutation) throws -> OfflineSnapshot {
        if let index = state.journalNotes.firstIndex(where: { $0.id == entryID }) {
            state.journalNotes[index].attachments.removeAll { $0.id == attachmentID }
        }
        appendMutation(mutation)
        try persist()
        return state
    }

    @discardableResult
    func replaceJournalRevisions(entryID: String, values: [JournalEntryRevisionModel]) throws -> OfflineSnapshot {
        state.journalRevisionsByEntryID[entryID] = values
        try persist()
        return state
    }

    func applyJournalChanges(_ changes: [SyncChange]) throws {
        var pending = Set(state.mutations.map { mutation -> String in
            let prefix: String
            if mutation.kind.hasPrefix("journal_tag.") { prefix = "journaltag" }
            else if mutation.kind.hasPrefix("journal_attachment.") { prefix = "journalattachment" }
            else if mutation.kind.hasPrefix("journal.") { prefix = "journalentry" }
            else { prefix = String(mutation.kind.split(separator: ".").first ?? "") }
            return "\(prefix):\(mutation.entityId)"
        })
        for mutation in state.mutations where mutation.kind == "journal_revision.restore" {
            if let entryID = mutation.payload["entryId"]?.stringValue { pending.insert("journalentry:\(entryID)") }
        }
        for change in changes {
            let prefix = change.entityType.lowercased()
            let pendingPrefix: String
            switch prefix {
            case "journaltag": pendingPrefix = "journal_tag"
            case "journalattachment": pendingPrefix = "journal_attachment"
            default: pendingPrefix = prefix
            }
            guard !pending.contains("\(prefix):\(change.entityId)"), !pending.contains("\(pendingPrefix):\(change.entityId)") else { continue }
            if prefix == "journalentry" {
                if change.deleted { state.journalNotes.removeAll { $0.id == change.entityId }; continue }
                guard let data = change.data, let value = try? decoder.decode(JournalNoteModel.self, from: encoder.encode(data)) else { continue }
                upsert(&state.journalNotes, value)
            } else if prefix == "journaltemplate" {
                if change.deleted { state.journalTemplates.removeAll { $0.id == change.entityId }; continue }
                guard let data = change.data, let value = try? decoder.decode(JournalTemplateModel.self, from: encoder.encode(data)) else { continue }
                upsert(&state.journalTemplates, value)
            } else if prefix == "journaltag" {
                if change.deleted { state.journalTags.removeAll { $0.id == change.entityId }; continue }
                guard let data = change.data, let value = try? decoder.decode(JournalTagModel.self, from: encoder.encode(data)) else { continue }
                upsert(&state.journalTags, value)
            } else if prefix == "journalrevision" {
                guard let data = change.data, let value = try? decoder.decode(JournalEntryRevisionModel.self, from: encoder.encode(data)) else { continue }
                var revisions = state.journalRevisionsByEntryID[value.entryId] ?? []
                upsert(&revisions, value)
                revisions.sort { $0.revisionNumber < $1.revisionNumber }
                state.journalRevisionsByEntryID[value.entryId] = revisions
            } else if prefix == "journalattachment" {
                if change.deleted {
                    for index in state.journalNotes.indices { state.journalNotes[index].attachments.removeAll { $0.id == change.entityId } }
                    continue
                }
                guard let data = change.data, let value = try? decoder.decode(JournalAttachmentModel.self, from: encoder.encode(data)), let index = state.journalNotes.firstIndex(where: { $0.id == value.entryId }) else { continue }
                state.journalNotes[index].attachments.removeAll { $0.id == value.id }
                state.journalNotes[index].attachments.append(value)
            }
        }
    }

    func reapplyPendingJournalMutations() {
        let now = ISO8601DateFormatter().string(from: Date())
        for mutation in state.mutations where mutation.kind == "journalpreferences.update" {
            if let value = mutation.payload["defaultEditorMode"]?.stringValue { state.journalPreferences.defaultEditorMode = value }
            if let value = mutation.payload["autoCreateDailyNote"]?.boolValue { state.journalPreferences.autoCreateDailyNote = value }
            if let value = mutation.payload["autoOpenTodayNote"]?.boolValue { state.journalPreferences.autoOpenTodayNote = value }
            if let value = mutation.payload["weekStartDay"]?.stringValue { state.journalPreferences.weekStartDay = value }
            if let value = mutation.payload["autoCreateWeeklyReview"]?.boolValue { state.journalPreferences.autoCreateWeeklyReview = value }
        }
        for mutation in state.mutations where mutation.kind == "journal_tag.create" {
            guard !state.journalTags.contains(where: { $0.id == mutation.entityId }),
                  let name = mutation.payload["name"]?.stringValue else { continue }
            let now = mutation.occurredAt
            state.journalTags.append(JournalTagModel(id: mutation.entityId, userId: "local", name: name, color: mutation.payload["color"]?.stringValue ?? "#74D5B2", createdAt: now, updatedAt: now))
        }
        for mutation in state.mutations where mutation.kind == "journal_template.update" {
            guard let index = state.journalTemplates.firstIndex(where: { $0.id == mutation.entityId }) else { continue }
            if let value = mutation.payload["name"]?.stringValue { state.journalTemplates[index].name = value }
            if let value = mutation.payload["titleTemplate"]?.stringValue { state.journalTemplates[index].titleTemplate = value }
            if let value = mutation.payload["bodyMarkdown"]?.stringValue { state.journalTemplates[index].bodyMarkdown = value }
            state.journalTemplates[index].version = max(state.journalTemplates[index].version, (mutation.baseVersion ?? state.journalTemplates[index].version) + 1)
        }
        for mutation in state.mutations where mutation.kind == "journal_attachment.delete" {
            guard let entryID = mutation.payload["entryId"]?.stringValue,
                  let index = state.journalNotes.firstIndex(where: { $0.id == entryID }) else { continue }
            state.journalNotes[index].attachments.removeAll { $0.id == mutation.entityId }
        }
        for mutation in state.mutations where mutation.kind.hasPrefix("journal.") {
            let targetID = mutation.kind == "journal_revision.restore" ? (mutation.payload["entryId"]?.stringValue ?? mutation.entityId) : mutation.entityId
            guard let index = state.journalNotes.firstIndex(where: { $0.id == targetID }) else { continue }
            switch mutation.kind {
            case "journal.delete": state.journalNotes[index].deletedAt = state.journalNotes[index].deletedAt ?? now
            case "journal.restore": state.journalNotes[index].deletedAt = nil
            case "journal.update", "journal_revision.restore":
                if let value = mutation.payload["title"]?.stringValue { state.journalNotes[index].title = value }
                if let value = mutation.payload["contentMarkdown"]?.stringValue { state.journalNotes[index].contentMarkdown = value }
                if let value = mutation.payload["entryDate"]?.stringValue { state.journalNotes[index].entryDate = value }
                if let value = mutation.payload["timezone"]?.stringValue { state.journalNotes[index].timezone = value }
                let templateID = iTuJournalSnapshotTemplateID(mutation.payload)
                if templateID.present { state.journalNotes[index].templateId = templateID.value }
                if let tagIDs = iTuJournalSnapshotTagIDs(mutation.payload) { state.journalNotes[index].tagIds = tagIDs }
                if case let .object(fields)? = mutation.payload["weeklyReview"] {
                    let existing = state.journalNotes[index].weeklyReview
                    let periodStart = fields["periodStart"]?.stringValue ?? existing?.periodStart ?? state.journalNotes[index].entryDate
                    let periodEnd = fields["periodEnd"]?.stringValue ?? existing?.periodEnd ?? periodStart
                    let summary = fields["summarySnapshot"].flatMap { value -> [String: JSONValue]? in
                        guard case let .object(values) = value else { return nil }; return values
                    } ?? existing?.summarySnapshot ?? [:]
                    state.journalNotes[index].weeklyReview = JournalWeeklyReviewModel(
                        entryId: state.journalNotes[index].id,
                        periodStart: periodStart,
                        periodEnd: periodEnd,
                        summarySnapshot: summary,
                        wentWellMarkdown: reviewMarkdown(fields, "wentWellMarkdown", existing?.wentWellMarkdown),
                        frictionMarkdown: reviewMarkdown(fields, "frictionMarkdown", existing?.frictionMarkdown),
                        learnedMarkdown: reviewMarkdown(fields, "learnedMarkdown", existing?.learnedMarkdown),
                        differentFromLastWeekMarkdown: reviewMarkdown(fields, "differentFromLastWeekMarkdown", existing?.differentFromLastWeekMarkdown),
                        nextWeekMarkdown: reviewMarkdown(fields, "nextWeekMarkdown", existing?.nextWeekMarkdown),
                        experimentSnapshot: fields["experimentSnapshot"] ?? existing?.experimentSnapshot,
                        comparisonSnapshot: fields["comparisonSnapshot"] ?? existing?.comparisonSnapshot,
                        aiInsightsSnapshot: existing?.aiInsightsSnapshot,
                        aiGenerationJobId: existing?.aiGenerationJobId,
                        aiGeneratedAt: existing?.aiGeneratedAt,
                        aiPromptVersion: existing?.aiPromptVersion,
                        aiSourceEntryVersion: existing?.aiSourceEntryVersion
                    )
                }
                if case let .object(fields)? = mutation.payload["dailyReview"] {
                    let existing = state.journalNotes[index].dailyReview
                    let summary = fields["summarySnapshot"].flatMap { value -> [String: JSONValue]? in
                        guard case let .object(values) = value else { return nil }; return values
                    } ?? existing?.summarySnapshot ?? [:]
                    state.journalNotes[index].dailyReview = JournalDailyReviewModel(
                        entryId: state.journalNotes[index].id,
                        periodDate: fields["periodDate"]?.stringValue ?? existing?.periodDate ?? state.journalNotes[index].entryDate,
                        summarySnapshot: summary,
                        wentWellMarkdown: reviewMarkdown(fields, "wentWellMarkdown", existing?.wentWellMarkdown),
                        frictionMarkdown: reviewMarkdown(fields, "frictionMarkdown", existing?.frictionMarkdown),
                        learnedMarkdown: reviewMarkdown(fields, "learnedMarkdown", existing?.learnedMarkdown),
                        contextMarkdown: reviewMarkdown(fields, "contextMarkdown", existing?.contextMarkdown),
                        aiInsightsSnapshot: existing?.aiInsightsSnapshot,
                        aiGenerationJobId: existing?.aiGenerationJobId,
                        aiGeneratedAt: existing?.aiGeneratedAt,
                        aiPromptVersion: existing?.aiPromptVersion,
                        aiSourceEntryVersion: existing?.aiSourceEntryVersion
                    )
                }
                state.journalNotes[index].version = max(state.journalNotes[index].version, (mutation.baseVersion ?? state.journalNotes[index].version) + 1)
            default: break
            }
        }
    }

    private func reviewMarkdown(_ fields: [String: JSONValue], _ key: String, _ fallback: String?) -> String? {
        guard let value = fields[key] else { return fallback }
        return value.stringValue
    }

    private func upsert<Value: Identifiable>(_ values: inout [Value], _ value: Value) where Value.ID: Equatable {
        if let index = values.firstIndex(where: { $0.id == value.id }) { values[index] = value } else { values.append(value) }
    }
}
