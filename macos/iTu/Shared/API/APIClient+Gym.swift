import Foundation

extension APIClient {
    // MARK: - Gym

    func getGymAnalytics(from: String, to: String) async throws -> GymAnalyticsModel {
        try await request(path: "/gym/analytics?from=\(escapedPath(from))&to=\(escapedPath(to))")
    }

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

    func createGymWorkout(title: String? = nil, routineId: String? = nil) async throws -> WorkoutModel {
        var body: [String: JSONValue] = [:]
        if let title { body["title"] = .string(title) }
        if let routineId { body["routineId"] = .string(routineId) }
        return try await request(path: "/gym/workouts", method: "POST", body: body)
    }

    func getGymRoutines() async throws -> [RoutineModel] {
        try await request(path: "/gym/routines")
    }

    func getGymRoutine(id: String) async throws -> RoutineModel {
        try await request(path: "/gym/routines/\(escapedPath(id))")
    }

    func createGymRoutine(name: String, description: String? = nil, exercises: [[String: JSONValue]] = []) async throws -> RoutineModel {
        var body: [String: JSONValue] = [
            "name": .string(name),
            "exercises": .array(exercises.map { .object($0) })
        ]
        if let description, !description.isEmpty { body["description"] = .string(description) }
        return try await request(path: "/gym/routines", method: "POST", body: body)
    }

    func updateGymRoutine(id: String, patch: [String: JSONValue]) async throws -> RoutineModel {
        try await request(path: "/gym/routines/\(escapedPath(id))", method: "PATCH", body: patch)
    }

    func deleteGymRoutine(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/gym/routines/\(escapedPath(id))", method: "DELETE")
    }

    func startWorkoutFromRoutine(routineId: String) async throws -> WorkoutModel {
        try await request(path: "/gym/routines/\(escapedPath(routineId))/start", method: "POST")
    }

    func repeatGymWorkout(workoutId: String) async throws -> WorkoutModel {
        try await request(path: "/gym/workouts/\(escapedPath(workoutId))/repeat", method: "POST")
    }

    func createGymRoutineFromWorkout(workoutId: String, name: String? = nil) async throws -> RoutineModel {
        var body: [String: JSONValue] = ["workoutId": .string(workoutId)]
        if let name, !name.isEmpty { body["name"] = .string(name) }
        return try await request(path: "/gym/routines/create-from-workout", method: "POST", body: body)
    }

    func updateGymRoutineFromWorkout(routineId: String, workoutId: String) async throws -> RoutineModel {
        let body: [String: JSONValue] = ["workoutId": .string(workoutId)]
        return try await request(
            path: "/gym/routines/\(escapedPath(routineId))/update-from-workout",
            method: "POST",
            body: body
        )
    }

    func toggleFavoriteGymExercise(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/gym/exercises/\(escapedPath(id))/favorite", method: "POST")
    }
}
