import Foundation

extension AppModel {
    /// Loads the NOTE entries used by existing callers (including the Companion).
    func loadJournalNotes() async {
        _ = await loadJournalNotesResult()
    }

    /// Loads notes and returns a user-facing error so Journal can keep the local snapshot visible.
    func loadJournalNotesResult() async -> String? {
        do {
            journalNotes = try await apiClient.getJournalNotes()
            return nil
        } catch {
            let message = error.localizedDescription
            errorMessage = message
            return message
        }
    }

    func saveJournalNote(id: String?, title: String, contentMarkdown: String, entryDate: String) async -> JournalNoteModel? {
        if let id {
            do {
                let note = try await apiClient.updateJournalNote(id: id, title: title, contentMarkdown: contentMarkdown, entryDate: entryDate)
                journalNotes = journalNotes.map { $0.id == note.id ? note : $0 }
                return note
            } catch {
                errorMessage = error.localizedDescription
                return nil
            }
        }

        do {
            let note = try await apiClient.createJournalNote(id: ULID.generate(), title: title, contentMarkdown: contentMarkdown, entryDate: entryDate)
            journalNotes.insert(note, at: 0)
            return note
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }
}
