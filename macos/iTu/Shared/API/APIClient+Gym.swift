import Foundation

extension APIClient {
    // MARK: - Gym

    func getGymExercise(id: String) async throws -> ExerciseModel { try await request(path: "/gym/exercises/\(escapedPath(id))") }
    func updateGymExercise(id: String, patch: [String: JSONValue]) async throws -> ExerciseModel { try await request(path: "/gym/exercises/\(escapedPath(id))", method: "PATCH", body: patch) }
    func getGymExerciseStats(id: String) async throws -> ExerciseStatsModel { try await request(path: "/gym/exercises/\(escapedPath(id))/stats") }
    func getGymWorkout(id: String) async throws -> WorkoutModel { try await request(path: "/gym/workouts/\(escapedPath(id))") }
    func updateGymWorkout(id: String, patch: [String: JSONValue]) async throws -> WorkoutModel { try await request(path: "/gym/workouts/\(escapedPath(id))", method: "PATCH", body: patch) }
    func deleteGymWorkout(id: String) async throws { let _: EmptyResponse = try await request(path: "/gym/workouts/\(escapedPath(id))", method: "DELETE") }
    func completeGymWorkout(id: String) async throws -> WorkoutModel { try await request(path: "/gym/workouts/\(escapedPath(id))/complete", method: "POST") }
    func abandonGymWorkout(id: String) async throws -> WorkoutModel { try await request(path: "/gym/workouts/\(escapedPath(id))/abandon", method: "POST") }
    func getGymPreferences() async throws -> GymPreferencesModel { try await request(path: "/preferences/gym") }
    func updateGymPreferences(_ patch: [String: JSONValue]) async throws -> GymPreferencesModel { try await request(path: "/preferences/gym", method: "PATCH", body: patch) }

    func getGymOverview() async throws -> GymOverviewModel {
        try await request(path: "/gym/overview")
    }

    func getGymExercises() async throws -> [ExerciseModel] {
        try await request(path: "/gym/exercises")
    }

    func createGymExercise(
        name: String,
        description: String? = nil,
        metricType: String = "WEIGHT_REPS",
        equipment: String? = nil,
        primaryMuscleGroup: String? = nil
    ) async throws -> ExerciseModel {
        var body: [String: JSONValue] = [
            "name": .string(name),
            "metricType": .string(metricType)
        ]
        if let description, !description.isEmpty { body["description"] = .string(description) }
        if let equipment, !equipment.isEmpty { body["equipment"] = .string(equipment) }
        if let primaryMuscleGroup, !primaryMuscleGroup.isEmpty { body["primaryMuscleGroup"] = .string(primaryMuscleGroup) }
        return try await request(path: "/gym/exercises", method: "POST", body: body)
    }

    func uploadGymExerciseImage(id: String, fileData: Data, fileName: String, mimeType: String) async throws -> ExerciseModel {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        return try await requestRawBody(
            path: "/gym/exercises/\(id)/image",
            method: "POST",
            contentType: "multipart/form-data; boundary=\(boundary)",
            bodyData: body
        )
    }

    func archiveGymExercise(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/gym/exercises/\(escapedPath(id))", method: "DELETE")
    }

    func getGymWorkouts(status: String? = nil, limit: Int? = nil) async throws -> [WorkoutModel] {
        var query: [String] = []
        if let status { query.append("status=\(status.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? status)") }
        if let limit { query.append("limit=\(limit)") }
        return try await request(path: query.isEmpty ? "/gym/workouts" : "/gym/workouts?\(query.joined(separator: "&"))")
    }

    func createGymWorkout(title: String? = nil) async throws -> WorkoutModel {
        var body: [String: JSONValue] = [:]
        if let title { body["title"] = .string(title) }
        return try await request(path: "/gym/workouts", method: "POST", body: body)
    }
}
