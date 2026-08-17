import Foundation
import iTuDomain

public extension APIClient {
    func getJournalNotes() async throws -> [JournalNoteModel] {
        try await request(path: "/journal/entries?includeDeleted=true")
    }

    func getJournalEntries(kind: String? = nil, query: String? = nil) async throws -> [JournalNoteModel] {
        var items: [String] = []
        if let kind { items.append("kind=\(kind.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? kind)") }
        if let query { items.append("query=\(query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query)") }
        return try await request(path: "/journal/entries" + (items.isEmpty ? "" : "?" + items.joined(separator: "&")))
    }

    func createJournalNote(id: String, title: String, contentMarkdown: String, entryDate: String) async throws -> JournalNoteModel {
        try await request(path: "/journal/entries", method: "POST", body: [
            "id": JSONValue.string(id),
            "kind": JSONValue.string("NOTE"),
            "title": JSONValue.string(title),
            "contentMarkdown": JSONValue.string(contentMarkdown),
            "entryDate": JSONValue.string(entryDate)
        ] as [String: JSONValue])
    }

    func updateJournalNote(id: String, title: String, contentMarkdown: String, entryDate: String) async throws -> JournalNoteModel {
        try await request(path: "/journal/entries/\(id)", method: "PATCH", body: [
            "title": JSONValue.string(title),
            "contentMarkdown": JSONValue.string(contentMarkdown),
            "entryDate": JSONValue.string(entryDate)
        ] as [String: JSONValue])
    }

    func createJournalEntry(_ payload: [String: JSONValue]) async throws -> JournalNoteModel {
        try await request(path: "/journal/entries", method: "POST", body: payload)
    }

    func updateJournalEntry(id: String, payload: [String: JSONValue]) async throws -> JournalNoteModel {
        try await request(path: "/journal/entries/\(escapedPath(id))", method: "PATCH", body: payload)
    }

    func deleteJournalEntry(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/journal/entries/\(escapedPath(id))", method: "DELETE")
    }

    func restoreJournalEntry(id: String) async throws -> JournalNoteModel {
        try await request(path: "/journal/entries/\(escapedPath(id))/restore", method: "POST")
    }

    func getJournalRevisions(entryID: String) async throws -> [JournalEntryRevisionModel] {
        try await request(path: "/journal/entries/\(escapedPath(entryID))/revisions")
    }

    func restoreJournalRevision(entryID: String, revisionID: String) async throws -> JournalNoteModel {
        try await request(path: "/journal/entries/\(escapedPath(entryID))/revisions/\(escapedPath(revisionID))/restore", method: "POST")
    }

    func getJournalTemplates() async throws -> [JournalTemplateModel] {
        try await request(path: "/journal/templates")
    }

    func createJournalTemplate(_ payload: [String: JSONValue]) async throws -> JournalTemplateModel {
        try await request(path: "/journal/templates", method: "POST", body: payload)
    }

    func updateJournalTemplate(id: String, payload: [String: JSONValue]) async throws -> JournalTemplateModel {
        try await request(path: "/journal/templates/\(escapedPath(id))", method: "PATCH", body: payload)
    }

    func deleteJournalTemplate(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/journal/templates/\(escapedPath(id))", method: "DELETE")
    }

    func getJournalTags() async throws -> [JournalTagModel] {
        try await request(path: "/journal/tags")
    }

    func createJournalTag(name: String, color: String? = nil) async throws -> JournalTagModel {
        var body: [String: JSONValue] = ["name": .string(name)]
        if let color { body["color"] = .string(color) }
        return try await request(path: "/journal/tags", method: "POST", body: body)
    }

    func uploadJournalAttachment(entryID: String, fileData: Data, fileName: String, mimeType: String, attachmentID: String? = nil) async throws -> JournalAttachmentModel {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"entryId\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(entryID)\r\n".data(using: .utf8)!)
        if let attachmentID {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"attachmentId\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(attachmentID)\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        return try await requestRawBody(path: "/journal/attachments/upload", method: "POST", contentType: "multipart/form-data; boundary=\(boundary)", bodyData: body)
    }

    func deleteJournalAttachment(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/journal/attachments/\(escapedPath(id))", method: "DELETE")
    }

    func getJournalWeeklySummary(periodStart: String, periodEnd: String, timezone: String = iTuCalendarSupport.timezone.identifier) async throws -> [String: JSONValue] {
        let start = periodStart.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? periodStart
        let end = periodEnd.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? periodEnd
        let zone = timezone.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? timezone
        return try await request(path: "/journal/weekly-summary?periodStart=\(start)&periodEnd=\(end)&timezone=\(zone)")
    }

    func getJournalDailySummary(date: String, timezone: String = iTuCalendarSupport.timezone.identifier) async throws -> [String: JSONValue] {
        let day = date.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? date
        let zone = timezone.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? timezone
        return try await request(path: "/journal/daily-summary?date=\(day)&timezone=\(zone)")
    }

    func generateReviewInsights(entryID: String) async throws -> JournalNoteModel {
        try await request(path: "/journal/entries/\(escapedPath(entryID))/ai-insights", method: "POST")
    }

    func updateJournalPreferences(_ patch: [String: JSONValue]) async throws -> JournalPreferencesModel {
        try await request(path: "/preferences/journal", method: "PATCH", body: patch)
    }
}
