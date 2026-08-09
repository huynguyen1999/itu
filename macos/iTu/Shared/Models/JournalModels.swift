import Foundation

struct JournalNoteModel: Codable, Sendable, Identifiable {
    let id: String
    let userId: String
    let kind: String
    var title: String
    var contentMarkdown: String
    var entryDate: String
    let updatedAt: String

    var previewText: String {
        let plainText = contentMarkdown
            .replacingOccurrences(of: "#", with: "")
            .replacingOccurrences(of: "*", with: "")
            .replacingOccurrences(of: "`", with: "")
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return plainText.isEmpty ? "An empty page, ready for the next line." : plainText
    }

    var displayDate: String { String(entryDate.prefix(10)) }
}
