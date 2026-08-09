import Foundation

extension AppModel {
    func loadJournalNotes() async { _ = await loadJournalNotesResult() }

    func loadJournalNotesResult() async -> String? {
        do {
            let notes = try await apiClient.getJournalNotes()
            let snapshot = try await offlineStore.replaceJournalNotes(notes)
            apply(snapshot)
            return nil
        } catch {
            let message = error.localizedDescription
            errorMessage = message
            return message
        }
    }

    func saveJournalNote(id: String?, title: String, contentMarkdown: String, entryDate: String, tagIds: [String]? = nil) async -> JournalNoteModel? {
        let now = Self.journalNow()
        let existing = id.flatMap { noteID in currentSnapshot.journalNotes.first(where: { $0.id == noteID }) }
        let note = JournalNoteModel(
            id: id ?? ULID.generate(), userId: user?.id ?? "local", kind: existing?.kind ?? "NOTE",
            title: title, contentMarkdown: contentMarkdown, entryDate: entryDate,
            updatedAt: now, timezone: existing?.timezone ?? iTuCalendarSupport.timezone.identifier,
            templateId: existing?.templateId, tagIds: tagIds ?? existing?.tagIds ?? [], version: existing?.version ?? 1,
            createdAt: existing?.createdAt ?? now, deletedAt: nil,
            weeklyReview: existing?.weeklyReview, tags: existing?.tags ?? [], attachments: existing?.attachments ?? []
        )
        var payload: [String: JSONValue] = [
            "title": .string(title), "contentMarkdown": .string(contentMarkdown),
            "entryDate": .string(entryDate), "timezone": .string(note.timezone),
            "tagIds": .array(note.tagIds.map(JSONValue.string))
        ]
        if let templateId = note.templateId { payload["templateId"] = .string(templateId) }
        let kind = id == nil ? "journal.create" : "journal.update"
        if id == nil {
            payload["id"] = .string(note.id); payload["kind"] = .string(note.kind)
        }
        let mutation = SyncMutation(
            id: ULID.generate(), kind: kind, entityId: note.id,
            baseVersion: existing?.version, baseValues: nil, payload: payload, occurredAt: now,
            attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil
        )
        do { apply(try await offlineStore.saveJournalNote(note, mutation: mutation)); return note }
        catch { errorMessage = error.localizedDescription; return nil }
    }

    func deleteJournalNote(id: String) async {
        let mutation = journalMutation(kind: "journal.delete", id: id, payload: [:])
        do {
            if let note = currentSnapshot.journalNotes.first(where: { $0.id == id }) {
                var deleted = note; deleted.deletedAt = Self.journalNow()
                apply(try await offlineStore.saveJournalNote(deleted, mutation: mutation))
            }
        } catch { errorMessage = error.localizedDescription }
    }

    func restoreJournalNote(id: String) async {
        let mutation = journalMutation(kind: "journal.restore", id: id, payload: [:])
        do {
            if var note = currentSnapshot.journalNotes.first(where: { $0.id == id }) {
                note.deletedAt = nil
                apply(try await offlineStore.saveJournalNote(note, mutation: mutation))
            }
        } catch { errorMessage = error.localizedDescription }
    }

    func saveWeeklyReview(id: String?, title: String, contentMarkdown: String, entryDate: String, review: JournalWeeklyReviewModel, tagIds: [String]? = nil) async -> JournalNoteModel? {
        let now = Self.journalNow()
        let existing = id.flatMap { noteID in currentSnapshot.journalNotes.first(where: { $0.id == noteID }) }
        var normalizedReview = review
        normalizedReview.periodStart = String(review.periodStart.prefix(10))
        normalizedReview.periodEnd = String(review.periodEnd.prefix(10))
        let note = JournalNoteModel(id: id ?? ULID.generate(), userId: user?.id ?? "local", kind: "WEEKLY_REVIEW", title: title, contentMarkdown: contentMarkdown, entryDate: String(entryDate.prefix(10)), updatedAt: now, timezone: existing?.timezone ?? iTuCalendarSupport.timezone.identifier, tagIds: tagIds ?? existing?.tagIds ?? [], version: existing?.version ?? 1, createdAt: existing?.createdAt ?? now, weeklyReview: normalizedReview, tags: existing?.tags ?? [], attachments: existing?.attachments ?? [])
        var payload = journalEntryPayload(note)
        if id == nil { payload["id"] = JSONValue.string(note.id); payload["kind"] = JSONValue.string("WEEKLY_REVIEW") }
        let mutation = SyncMutation(id: ULID.generate(), kind: id == nil ? "journal.create" : "journal.update", entityId: note.id, baseVersion: existing?.version, baseValues: nil, payload: payload, occurredAt: now, attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil)
        do { apply(try await offlineStore.saveJournalNote(note, mutation: mutation)); return note }
        catch { errorMessage = error.localizedDescription; return nil }
    }

    func loadJournalRevisions(entryID: String) async {
        do {
            let revisions = try await apiClient.getJournalRevisions(entryID: entryID)
            apply(try await offlineStore.replaceJournalRevisions(entryID: entryID, values: revisions))
        } catch { errorMessage = error.localizedDescription }
    }

    func restoreJournalRevision(entryID: String, revisionID: String) async {
        guard let revision = currentSnapshot.journalRevisionsByEntryID[entryID]?.first(where: { $0.id == revisionID }),
              var note = currentSnapshot.journalNotes.first(where: { $0.id == entryID }) else { return }
        if let value = revision.snapshot["title"]?.stringValue { note.title = value }
        if let value = revision.snapshot["contentMarkdown"]?.stringValue { note.contentMarkdown = value }
        if let value = revision.snapshot["entryDate"]?.stringValue { note.entryDate = value }
        if let value = revision.snapshot["timezone"]?.stringValue { note.timezone = value }
        let templateID = iTuJournalSnapshotTemplateID(revision.snapshot)
        if templateID.present { note.templateId = templateID.value }
        if let tagIDs = iTuJournalSnapshotTagIDs(revision.snapshot) { note.tagIds = tagIDs }
        if case let .object(fields)? = revision.snapshot["weeklyReview"] {
            let existing = note.weeklyReview
            let summary = fields["summarySnapshot"].flatMap { value -> [String: JSONValue]? in guard case let .object(values) = value else { return nil }; return values } ?? existing?.summarySnapshot ?? [:]
            note.weeklyReview = JournalWeeklyReviewModel(entryId: entryID, periodStart: fields["periodStart"]?.stringValue ?? existing?.periodStart ?? note.entryDate, periodEnd: fields["periodEnd"]?.stringValue ?? existing?.periodEnd ?? note.entryDate, summarySnapshot: summary, wentWellMarkdown: fields["wentWellMarkdown"]?.stringValue ?? existing?.wentWellMarkdown, frictionMarkdown: fields["frictionMarkdown"]?.stringValue ?? existing?.frictionMarkdown, nextWeekMarkdown: fields["nextWeekMarkdown"]?.stringValue ?? existing?.nextWeekMarkdown, experimentSnapshot: fields["experimentSnapshot"] ?? existing?.experimentSnapshot)
        }
        var payload = revision.snapshot
        payload["entryId"] = .string(entryID)
        payload["revisionId"] = .string(revisionID)
        let mutation = SyncMutation(id: ULID.generate(), kind: "journal_revision.restore", entityId: revision.id, baseVersion: note.version, payload: payload, occurredAt: Self.journalNow())
        do { apply(try await offlineStore.saveJournalNote(note, mutation: mutation)) }
        catch { errorMessage = error.localizedDescription }
    }

    func loadJournalWeeklySummary(periodStart: String, periodEnd: String) async -> [String: JSONValue]? {
        do { return try await apiClient.getJournalWeeklySummary(periodStart: periodStart, periodEnd: periodEnd) }
        catch {
            errorMessage = "Weekly summary unavailable offline: \(error.localizedDescription)"
            return nil
        }
    }

    func deleteJournalAttachment(entryID: String, attachmentID: String) async {
        let mutation = SyncMutation(id: ULID.generate(), kind: "journal_attachment.delete", entityId: attachmentID, baseVersion: nil, payload: ["entryId": .string(entryID)], occurredAt: Self.journalNow())
        do { apply(try await offlineStore.deleteJournalAttachment(entryID: entryID, attachmentID: attachmentID, mutation: mutation)) }
        catch { errorMessage = error.localizedDescription }
    }

    func queueJournalAttachment(id: String, data: Data, entryId: String = "", fileName: String = "attachment", mimeType: String = "application/octet-stream") async {
        do { apply(try await offlineStore.queueJournalAttachment(id: id, data: data, entryId: entryId, fileName: fileName, mimeType: mimeType)) }
        catch { errorMessage = error.localizedDescription }
    }

    func retryJournalAttachment(id: String) async {
        // The bytes remain durable until the sync-capable uploader acknowledges them.
        guard currentSnapshot.pendingJournalAttachments[id] != nil else { return }
        let metadata = currentSnapshot.pendingJournalAttachmentMetadata[id]
        await queueJournalAttachment(id: id, data: currentSnapshot.pendingJournalAttachments[id]!, entryId: metadata?.entryId ?? "", fileName: metadata?.fileName ?? "attachment", mimeType: metadata?.mimeType ?? "application/octet-stream")
    }

    @MainActor
    func uploadPendingJournalAttachments() async {
        let snapshot = await offlineStore.snapshot()
        for (id, data) in snapshot.pendingJournalAttachments {
            guard let metadata = snapshot.pendingJournalAttachmentMetadata[id], !metadata.entryId.isEmpty else {
                errorMessage = "Attachment \(id) is missing its Journal entry."
                continue
            }
            do {
                let attachment = try await apiClient.uploadJournalAttachment(entryID: metadata.entryId, fileData: data, fileName: metadata.fileName, mimeType: metadata.mimeType, attachmentID: id)
                let freshSnapshot = await offlineStore.snapshot()
                if var note = freshSnapshot.journalNotes.first(where: { $0.id == metadata.entryId }) {
                    note.attachments.removeAll { $0.id == attachment.id }
                    note.attachments.append(attachment)
                    apply(try await offlineStore.replaceJournalNote(note))
                }
                apply(try await offlineStore.removeJournalAttachment(id: id))
            } catch {
                errorMessage = "Attachment upload failed: \(error.localizedDescription)"
            }
        }
    }

    func updateJournalPreferences(_ patch: [String: JSONValue]) async {
        var preferences = currentSnapshot.journalPreferences
        var canonicalPatch = patch
        if let value = patch["defaultEditorMode"]?.stringValue {
            let canonical = Self.canonicalEditorMode(value)
            preferences.defaultEditorMode = canonical
            settingsStore.journalDefaultEditorMode = Self.nativeEditorMode(canonical)
            canonicalPatch["defaultEditorMode"] = .string(canonical)
        }
        if let value = patch["autoCreateDailyNote"]?.boolValue { preferences.autoCreateDailyNote = value }
        if let value = patch["autoOpenTodayNote"]?.boolValue { preferences.autoOpenTodayNote = value }
        if let value = patch["weekStartDay"]?.stringValue { preferences.weekStartDay = value; settingsStore.journalWeekStartDay = value }
        if let value = patch["autoCreateWeeklyReview"]?.boolValue { preferences.autoCreateWeeklyReview = value; settingsStore.journalAutoCreateWeeklyReview = value }
        let mutation = SyncMutation(id: ULID.generate(), kind: "journalpreferences.update", entityId: "journal", baseVersion: nil, baseValues: nil, payload: canonicalPatch, occurredAt: Self.journalNow(), attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil)
        do { apply(try await offlineStore.saveJournalPreferences(preferences, mutation: mutation)) }
        catch { errorMessage = error.localizedDescription }
    }

    func updateJournalTemplate(id: String, name: String, titleTemplate: String, bodyMarkdown: String) async {
        guard let old = currentSnapshot.journalTemplates.first(where: { $0.id == id }) else { return }
        let now = Self.journalNow()
        var value = old
        value.name = name
        value.titleTemplate = titleTemplate
        value.bodyMarkdown = bodyMarkdown
        value.updatedAt = now
        value.version += 1
        let payload: [String: JSONValue] = ["name": .string(name), "titleTemplate": .string(titleTemplate), "bodyMarkdown": .string(bodyMarkdown)]
        let mutation = SyncMutation(id: ULID.generate(), kind: "journal_template.update", entityId: id, baseVersion: old.version, payload: payload, occurredAt: now)
        do { apply(try await offlineStore.saveJournalTemplate(value, mutation: mutation)) }
        catch { errorMessage = error.localizedDescription }
    }

    @MainActor
    func createJournalTemplate(name: String, entryKind: String = "NOTE", titleTemplate: String = "", bodyMarkdown: String = "") async {
        let now = Self.journalNow()
        let value = JournalTemplateModel(id: ULID.generate(), userId: user?.id ?? "local", name: name, entryKind: entryKind, titleTemplate: titleTemplate, bodyMarkdown: bodyMarkdown, defaults: [:], builtIn: false, archivedAt: nil, version: 1, createdAt: now, updatedAt: now)
        let payload: [String: JSONValue] = ["id": .string(value.id), "name": .string(name), "entryKind": .string(entryKind), "titleTemplate": .string(titleTemplate), "bodyMarkdown": .string(bodyMarkdown), "defaults": .object([:]), "builtIn": .bool(false)]
        let mutation = SyncMutation(id: ULID.generate(), kind: "journal_template.create", entityId: value.id, baseVersion: nil, payload: payload, occurredAt: now)
        do { apply(try await offlineStore.saveJournalTemplate(value, mutation: mutation)) } catch { errorMessage = error.localizedDescription }
    }

    @MainActor
    func deleteJournalTemplate(id: String) async {
        guard let old = currentSnapshot.journalTemplates.first(where: { $0.id == id }) else { return }
        var value = old; value.archivedAt = Self.journalNow()
        let mutation = SyncMutation(id: ULID.generate(), kind: "journal_template.delete", entityId: id, baseVersion: old.version, payload: [:], occurredAt: Self.journalNow())
        do { apply(try await offlineStore.saveJournalTemplate(value, mutation: mutation)) } catch { errorMessage = error.localizedDescription }
    }

    @MainActor
    func createJournalTag(name: String, color: String = "#74D5B2") async {
        let now = Self.journalNow()
        let value = JournalTagModel(id: ULID.generate(), userId: user?.id ?? "local", name: name, color: color, createdAt: now, updatedAt: now)
        let mutation = SyncMutation(id: ULID.generate(), kind: "journal_tag.create", entityId: value.id, baseVersion: nil, payload: ["name": .string(name), "color": .string(color)], occurredAt: now)
        do { apply(try await offlineStore.saveJournalTag(value, mutation: mutation)) }
        catch { errorMessage = error.localizedDescription }
    }

    private func journalMutation(kind: String, id: String, payload: [String: JSONValue]) -> SyncMutation {
        SyncMutation(id: ULID.generate(), kind: kind, entityId: id, baseVersion: currentSnapshot.journalNotes.first(where: { $0.id == id })?.version, baseValues: nil, payload: payload, occurredAt: Self.journalNow(), attemptCount: nil, lastAttemptAt: nil, nextRetryAt: nil, lastErrorCode: nil)
    }

    private func journalEntryPayload(_ note: JournalNoteModel) -> [String: JSONValue] {
        var payload: [String: JSONValue] = ["title": .string(note.title), "contentMarkdown": .string(note.contentMarkdown), "entryDate": .string(note.entryDate), "timezone": .string(note.timezone), "tagIds": .array(note.tagIds.map(JSONValue.string))]
        if let review = note.weeklyReview {
            var fields: [String: JSONValue] = ["periodStart": .string(review.periodStart), "periodEnd": .string(review.periodEnd), "summarySnapshot": .object(review.summarySnapshot)]
            fields["wentWellMarkdown"] = .string(review.wentWellMarkdown ?? "")
            fields["frictionMarkdown"] = .string(review.frictionMarkdown ?? "")
            fields["nextWeekMarkdown"] = .string(review.nextWeekMarkdown ?? "")
            if let value = review.experimentSnapshot { fields["experimentSnapshot"] = value }
            payload["weeklyReview"] = .object(fields)
        }
        return payload
    }

    private static func canonicalEditorMode(_ value: String) -> String {
        switch value.uppercased() {
        case "SOURCE", "EDIT": return "EDIT"
        case "PREVIEW": return "PREVIEW"
        default: return "LIVE"
        }
    }

    private static func nativeEditorMode(_ value: String) -> String {
        value.uppercased() == "EDIT" ? "SOURCE" : canonicalEditorMode(value)
    }

    private static func journalNow() -> String { ISO8601DateFormatter().string(from: Date()) }
}
