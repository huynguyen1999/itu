import Foundation

extension APIClient {
    // MARK: - Trash

    func fetchTrash() async throws -> TrashSnapshotModel {
        try await request(path: "/trash")
    }

    func restoreTrashTask(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/trash/tasks/\(id)/restore", method: "POST")
    }

    func permanentlyDeleteTrashTask(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/trash/tasks/\(id)", method: "DELETE")
    }

    func permanentlyDeleteTrashDeck(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/trash/decks/\(id)", method: "DELETE")
    }

    func permanentlyDeleteTrashCard(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/trash/cards/\(id)", method: "DELETE")
    }

    func restoreTrashJournalEntry(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/trash/journal-entries/\(escapedPath(id))/restore", method: "POST")
    }

    func permanentlyDeleteTrashJournalEntry(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/trash/journal-entries/\(escapedPath(id))", method: "DELETE")
    }

    func restoreTrashExpense(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/trash/expenses/\(escapedPath(id))/restore", method: "POST")
    }

    func permanentlyDeleteTrashExpense(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/trash/expenses/\(escapedPath(id))", method: "DELETE")
    }

    func restoreTrashGymWorkout(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/trash/gym-workouts/\(escapedPath(id))/restore", method: "POST")
    }

    func permanentlyDeleteTrashGymWorkout(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/trash/gym-workouts/\(escapedPath(id))", method: "DELETE")
    }

    func restoreTrashGymExercise(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/trash/gym-exercises/\(escapedPath(id))/restore", method: "POST")
    }

    func permanentlyDeleteTrashGymExercise(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/trash/gym-exercises/\(escapedPath(id))", method: "DELETE")
    }
}
