import Foundation

struct APIError: LocalizedError, Sendable {
    let statusCode: Int
    let message: String
    let code: String?
    let retryAfter: TimeInterval?

    init(statusCode: Int, message: String, code: String? = nil, retryAfter: TimeInterval? = nil) {
        self.statusCode = statusCode
        self.message = message
        self.code = code
        self.retryAfter = retryAfter
    }

    var errorDescription: String? { message }
}

private struct APIErrorBody: Decodable {
    let message: String?
    let code: String?
}

private struct CursorPageMeta: Decodable {
    let hasNextPage: Bool
    let nextCursor: String?
}

private struct CursorPageResponse<Item: Decodable>: Decodable {
    let data: [Item]
    let meta: CursorPageMeta?
}

private struct DueCardResponse: Decodable {
    let card: CardModel
    let state: DueCardState
}

private struct DueCardState: Decodable {
    let direction: String
}

private struct ServerUsagePreferences: Decodable {
    let trackingEnabled: Bool
    let websiteTrackingEnabled: Bool
    let retentionDays: Int
    let idleThresholdSeconds: Int
    let excludedBundleIds: [String]
}

private struct UserPreferencesResponse: Decodable {
    let usage: ServerUsagePreferences
}

actor APIClient {
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private var accessToken: String?
    private var refreshTask: Task<AuthSession, Error>?

    init(session: URLSession = .shared) {
        self.session = session
        encoder = JSONEncoder()
        decoder = JSONDecoder()
        let tokens = SessionCache.loadTokens()
        accessToken = tokens.accessToken
    }

    func login(identifier: String, password: String) async throws -> AuthSession {
        let body: [String: JSONValue] = [
            "identifier": .string(identifier),
            "password": .string(password)
        ]
        let session: AuthSession = try await request(
            path: "/auth/login",
            method: "POST",
            body: body,
            authorize: false
        )
        accessToken = session.accessToken
        storeSession(session)
        return session
    }

    func register(identifier: String, password: String, displayName: String) async throws -> AuthSession {
        let identifierKey = identifier.contains("@") ? "email" : "username"
        var body: [String: JSONValue] = [
            identifierKey: .string(identifier),
            "password": .string(password)
        ]
        let trimmedName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedName.isEmpty {
            body["displayName"] = .string(trimmedName)
        }
        let session: AuthSession = try await request(
            path: "/auth/register",
            method: "POST",
            body: body,
            authorize: false
        )
        accessToken = session.accessToken
        storeSession(session)
        return session
    }

    func restoreSession() async throws -> AuthSession {
        if accessToken == nil {
            accessToken = SessionCache.loadTokens().accessToken
        }
        do {
            let session = try await refresh()
            return session
        } catch {
            if let apiError = error as? APIError, apiError.statusCode == 401 {
                accessToken = nil
                SessionCache.clearUser()
                throw error
            }
            if let user = SessionCache.loadUser() {
                return AuthSession(
                    user: user,
                    accessToken: accessToken ?? "",
                    refreshToken: SessionCache.loadTokens().refreshToken ?? ""
                )
            }
            throw error
        }
    }

    func logout() async {
        _ = try? await request(path: "/auth/logout", method: "POST") as EmptyResponse
        accessToken = nil
        SessionCache.clearUser()
    }

    func updateProfile(displayName: String?, username: String?) async throws -> AuthSession {
        let session: AuthSession = try await request(
            path: "/auth/me",
            method: "PATCH",
            body: [
                "displayName": displayName.map(JSONValue.string) ?? .null,
                "username": username.map(JSONValue.string) ?? .null
            ] as [String: JSONValue]
        )
        accessToken = session.accessToken
        storeSession(session)
        return session
    }

    func changePassword(currentPassword: String, newPassword: String) async throws {
        _ = try await request(
            path: "/auth/password",
            method: "POST",
            body: [
                "currentPassword": .string(currentPassword),
                "newPassword": .string(newPassword)
            ] as [String: JSONValue]
        ) as EmptyResponse
    }

    func exportAccountData() async throws -> JSONValue {
        try await request(path: "/auth/data-export")
    }

    func deleteAccount(password: String?) async throws {
        _ = try await request(
            path: "/auth/me",
            method: "DELETE",
            body: ["password": password.map(JSONValue.string) ?? .null] as [String: JSONValue]
        ) as EmptyResponse
        SessionCache.clearUser()
    }

    func synchronize(_ requestBody: SyncRequest) async throws -> SyncResponse {
        try await request(path: "/sync", method: "POST", body: requestBody)
    }

    func registerSyncDevice(deviceId: String, cursor: String) async throws {
        let _: EmptyResponse = try await request(
            path: "/devices/register",
            method: "POST",
            body: [
                "deviceId": .string(deviceId),
                "platform": .string("MACOS"),
                "lastKnownSyncCursor": .string(cursor)
            ] as [String: JSONValue]
        )
    }

    func updateSyncDevice(deviceId: String, cursor: String) async throws {
        let _: EmptyResponse = try await request(
            path: "/devices/\(deviceId)",
            method: "PATCH",
            body: ["lastKnownSyncCursor": .string(cursor)] as [String: JSONValue]
        )
    }

    func token() -> String? {
        accessToken
    }

    func uploadUsageSummaries(_ summaries: [UsageSummary], deviceId: String) async throws {
        let body: [String: JSONValue] = [
            "deviceId": .string(deviceId),
            "summaries": .array(summaries.map { summary in
                var payload: [String: JSONValue] = [
                    "localDate": .string(summary.localDate),
                    "bundleId": .string(summary.bundleId),
                    "displayName": .string(summary.displayName),
                    "timezone": .string(summary.timezone),
                    "activeSeconds": .number(Double(summary.activeSeconds))
                ]
                if let hour = summary.hour { payload["hour"] = .number(Double(hour)) }
                if let engagedSeconds = summary.engagedSeconds {
                    payload["engagedSeconds"] = .number(Double(engagedSeconds))
                }
                return .object(payload)
            })
        ]
        let _: EmptyResponse = try await request(path: "/usage/summaries/batch", method: "POST", body: body)
    }

    func uploadWebsiteUsageSummaries(_ summaries: [WebsiteUsageSummary], deviceId: String) async throws {
        let body: [String: JSONValue] = [
            "deviceId": .string(deviceId),
            "summaries": .array(summaries.map { summary in
                .object([
                    "localDate": .string(summary.localDate),
                    "browserBundleId": .string(summary.browserBundleId),
                    "browserDisplayName": .string(summary.browserDisplayName),
                    "hostname": .string(summary.hostname),
                    "timezone": .string(summary.timezone),
                    "activeSeconds": .number(Double(summary.activeSeconds))
                ])
            })
        ]
        let _: EmptyResponse = try await request(path: "/usage/websites/summaries/batch", method: "POST", body: body)
    }

    func fetchUsageAppIdentities() async throws -> [UsageAppIdentity] {
        try await request(path: "/usage/apps")
    }

    func uploadUsageAppIcon(bundleId: String, displayName: String, fileData: Data) async throws -> UsageAppIdentity {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"displayName\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(displayName)\r\n".data(using: .utf8)!)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"\(bundleId).png\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/png\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        return try await requestRawBody(
            path: "/usage/apps/\(escapedPath(bundleId))/icon",
            method: "PUT",
            contentType: "multipart/form-data; boundary=\(boundary)",
            bodyData: body
        )
    }

    func fetchUsage(from: String? = nil, to: String? = nil) async throws -> UsageStatistics {
        var path = "/usage/summaries"
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        if !query.isEmpty { path += "?\(query.joined(separator: "&"))" }
        return try await request(path: path)
    }

    func fetchWebsiteUsage(from: String? = nil, to: String? = nil) async throws -> WebsiteUsageStatistics {
        var path = "/usage/websites/summaries"
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        if !query.isEmpty { path += "?\(query.joined(separator: "&"))" }
        return try await request(path: path)
    }

    func fetchWebsiteUsageStatistics(from: String? = nil, to: String? = nil) async throws -> WebsiteUsageStatistics {
        var path = "/usage/websites/statistics"
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        if !query.isEmpty { path += "?\(query.joined(separator: "&"))" }
        return try await request(path: path)
    }

    func deleteUsage(from: String? = nil, to: String? = nil) async throws {
        var path = "/usage/summaries"
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        if !query.isEmpty { path += "?\(query.joined(separator: "&"))" }
        let _: EmptyResponse = try await request(path: path, method: "DELETE")
    }

    func deleteWebsiteUsage(from: String? = nil, to: String? = nil) async throws {
        var path = "/usage/websites/summaries"
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        if !query.isEmpty { path += "?\(query.joined(separator: "&"))" }
        let _: EmptyResponse = try await request(path: path, method: "DELETE")
    }

    func fetchUsagePreferences() async throws -> UsagePreferences {
        let response: UserPreferencesResponse = try await request(path: "/preferences")
        return UsagePreferences(
            enabled: response.usage.trackingEnabled,
            websiteTrackingEnabled: response.usage.websiteTrackingEnabled,
            retentionDays: response.usage.retentionDays,
            idleThresholdSeconds: response.usage.idleThresholdSeconds,
            excludedBundleIds: response.usage.excludedBundleIds
        )
    }

    func updateUsagePreferences(_ preferences: UsagePreferences) async throws {
        let _: EmptyResponse = try await request(path: "/preferences/usage", method: "PATCH", body: [
            "trackingEnabled": .bool(preferences.enabled),
            "websiteTrackingEnabled": .bool(preferences.enabled && preferences.websiteTrackingEnabled),
            "retentionDays": .number(Double(preferences.retentionDays)),
            "idleThresholdSeconds": .number(Double(preferences.idleThresholdSeconds)),
            "excludedBundleIds": .array(preferences.excludedBundleIds.map(JSONValue.string))
        ] as [String: JSONValue])
    }

    func getBudgetPeriod(period: String) async throws -> BudgetPeriodModel {
        try await request(path: "/budget/periods/\(escapedPath(period))")
    }

    func updateBudgetPeriod(period: String, overallLimit: String) async throws -> BudgetPeriodModel {
        try await request(path: "/budget/periods/\(escapedPath(period))", method: "PUT", body: ["overallLimit": .string(Self.decimalString(overallLimit))] as [String: JSONValue])
    }

    func updateBudgetCategoryLimit(period: String, categoryID: String, limit: String) async throws -> BudgetPeriodModel {
        try await request(path: "/budget/periods/\(escapedPath(period))/categories/\(escapedPath(categoryID))", method: "PUT", body: ["limit": .string(Self.decimalString(limit))] as [String: JSONValue])
    }

    func deleteBudgetCategoryLimit(period: String, categoryID: String) async throws -> BudgetPeriodModel {
        try await request(path: "/budget/periods/\(escapedPath(period))/categories/\(escapedPath(categoryID))", method: "DELETE")
    }

    func getBudgetTransaction(id: String) async throws -> BudgetTransactionModel {
        try await request(path: "/budget/transactions/\(escapedPath(id))")
    }

    func createBudgetTransaction(amount: String, currency: String = "VND", type: String = "EXPENSE", categoryID: String, merchant: String?, paymentMethod: String = "CASH", transactionAt: String, note: String?) async throws -> BudgetTransactionModel {
        var body: [String: JSONValue] = ["amount": .string(Self.decimalString(amount)), "currency": .string(currency), "type": .string(type), "categoryId": .string(categoryID), "paymentMethod": .string(paymentMethod), "transactionAt": .string(transactionAt)]
        body["merchant"] = merchant.map(JSONValue.string) ?? .null
        body["note"] = note.map(JSONValue.string) ?? .null
        return try await request(path: "/budget/transactions", method: "POST", body: body)
    }

    func updateBudgetTransaction(id: String, patch: [String: JSONValue]) async throws -> BudgetTransactionModel {
        try await request(path: "/budget/transactions/\(escapedPath(id))", method: "PATCH", body: patch)
    }

    func deleteBudgetTransaction(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/budget/transactions/\(escapedPath(id))", method: "DELETE")
    }

    func getBudgetPreferences() async throws -> BudgetPreferencesModel { try await request(path: "/preferences/budget") }
    func updateBudgetPreferences(_ patch: [String: JSONValue]) async throws -> BudgetPreferencesModel { try await request(path: "/preferences/budget", method: "PATCH", body: patch) }

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

    func fetchTasks() async throws -> [ProductivityTask] {
        var tasks: [ProductivityTask] = []
        var cursor: String?

        while true {
            var path = "/productivity/tasks?limit=100"
            if let cursor {
                path += "&cursor=\(cursor)"
            }
            let page: CursorPageResponse<ProductivityTask> = try await request(
                path: path,
                method: "GET",
                body: Optional<String>.none
            )
            tasks.append(contentsOf: page.data)

            guard page.meta?.hasNextPage == true,
                  let nextCursor = page.meta?.nextCursor,
                  nextCursor != cursor else {
                return tasks
            }
            cursor = nextCursor
        }
    }

    func fetchTaskLists() async throws -> [TaskListModel] {
        try await request(path: "/productivity/task-lists")
    }

    func fetchTaskSections() async throws -> [TaskSectionModel] {
        try await request(path: "/productivity/task-sections")
    }

    func fetchTaskTags() async throws -> [TagModel] {
        try await request(path: "/productivity/task-tags")
    }

    func fetchTaskMetadata() async throws -> [TaskMetadataDTO] {
        try await request(path: "/productivity/tasks")
    }

    func activeFocus() async throws -> FocusSession? {
        try await request(path: "/productivity/focus-sessions/active")
    }

    func focusHistory() async throws -> [FocusSession] {
        try await request(path: "/productivity/focus-sessions/history")
    }

    func focusSummary() async throws -> FocusSummary {
        try await request(path: "/productivity/focus-sessions/summary")
    }

    func fetchFocusSounds() async throws -> FocusSoundCatalog {
        try await request(path: "/productivity/focus-sounds")
    }

    func updateFocusSoundPreference(
        soundKey: String,
        enabled: Bool? = nil,
        sortOrder: Int? = nil,
        volume: Double? = nil
    ) async throws -> FocusSoundPreference {
        var body: [String: JSONValue] = [:]
        if let enabled { body["enabled"] = .bool(enabled) }
        if let sortOrder { body["sortOrder"] = .number(Double(sortOrder)) }
        if let volume { body["volume"] = .number(volume) }
        let encodedKey = soundKey.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? soundKey
        return try await request(
            path: "/productivity/focus-sounds/\(encodedKey)/preferences",
            method: "PATCH",
            body: body
        )
    }

    func uploadFocusSound(name: String, fileData: Data, fileName: String, mimeType: String) async throws -> FocusSound {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"name\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(name)\r\n".data(using: .utf8)!)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        let contentType = "multipart/form-data; boundary=\(boundary)"
        return try await requestRawBody(
            path: "/productivity/focus-sounds",
            method: "POST",
            contentType: contentType,
            bodyData: body
        )
    }

    func updateFocusSound(id: String, name: String) async throws -> FocusSound {
        let body: [String: JSONValue] = ["name": .string(name)]
        let encodedId = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        return try await request(
            path: "/productivity/focus-sounds/\(encodedId)",
            method: "PATCH",
            body: body
        )
    }

    func deleteFocusSound(id: String) async throws {
        let encodedId = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        let _: EmptyResponse = try await request(path: "/productivity/focus-sounds/\(encodedId)", method: "DELETE")
    }

    private func requestRawBody<ResponseBody: Decodable>(
        path: String,
        method: String,
        contentType: String,
        bodyData: Data
    ) async throws -> ResponseBody {
        let baseURL = APIConfiguration.baseURL
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIError(statusCode: 0, message: "The API URL is invalid", code: nil)
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 60
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(contentType, forHTTPHeaderField: "Content-Type")
        req.httpBody = bodyData
        if let accessToken {
            req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        var (data, response) = try await session.data(for: req)
        guard var httpResponse = response as? HTTPURLResponse else {
            throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
        }

        if httpResponse.statusCode == 401 {
            _ = try await refresh()
            if let accessToken {
                req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            }
            (data, response) = try await session.data(for: req)
            guard let retriedResponse = response as? HTTPURLResponse else {
                throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
            }
            httpResponse = retriedResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorBody = try? decoder.decode(APIErrorBody.self, from: data)
            throw APIError(
                statusCode: httpResponse.statusCode,
                message: errorBody?.message ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode),
                code: errorBody?.code,
                retryAfter: Self.retryAfter(from: httpResponse)
            )
        }
        if ResponseBody.self == EmptyResponse.self, data.isEmpty {
            return EmptyResponse() as! ResponseBody
        }
        return try decoder.decode(ResponseBody.self, from: data)
    }


    func downloadFocusSound(path: String) async throws -> Data {
        var request = try makeRequest(path: path, method: "GET", body: Optional<String>.none, authorize: true)
        var (data, response) = try await session.data(for: request)
        guard var httpResponse = response as? HTTPURLResponse else {
            throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
        }
        if httpResponse.statusCode == 401 {
            _ = try await refresh()
            request = try makeRequest(path: path, method: "GET", body: Optional<String>.none, authorize: true)
            (data, response) = try await session.data(for: request)
            guard let retriedResponse = response as? HTTPURLResponse else {
                throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
            }
            httpResponse = retriedResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorBody = try? decoder.decode(APIErrorBody.self, from: data)
            throw APIError(
                statusCode: httpResponse.statusCode,
                message: errorBody?.message ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode),
                code: errorBody?.code,
                retryAfter: Self.retryAfter(from: httpResponse)
            )
        }
        return data
    }

    func fetchHabits() async throws -> [HabitModel] {
        try await request(path: "/productivity/habits")
    }

    func fetchHabitTimeBlocks() async throws -> [HabitTimeBlockModel] {
        try await request(path: "/productivity/habit-time-blocks")
    }

    func createHabitTimeBlock(name: String) async throws -> HabitTimeBlockModel {
        try await request(
            path: "/productivity/habit-time-blocks",
            method: "POST",
            body: [
                "name": .string(name),
                "icon": .string("ListChecks"),
                "color": .string("SLATE"),
                "startLocal": .string("00:00"),
                "endLocal": .string("23:59")
            ] as [String: JSONValue]
        )
    }

    func fetchHabitOccurrences(from: String, to: String) async throws -> [HabitOccurrenceModel] {
        try await request(path: "/productivity/habit-occurrences?from=\(from)&to=\(to)"
        )
    }

    func fetchHabitStats(id: String) async throws -> HabitStatsModel {
        try await request(path: "/productivity/habits/\(id)/stats")
    }

    func checkInHabitOccurrence(id: String, value: Double, idempotencyKey: String) async throws -> HabitOccurrenceModel {
        try await request(
            path: "/productivity/habit-occurrences/\(id)/check-in",
            method: "POST",
            body: [
                "value": .number(value),
                "idempotencyKey": .string(idempotencyKey)
            ] as [String: JSONValue]
        )
    }

    func habitOccurrenceAction(
        id: String,
        action: String,
        idempotencyKey: String = ULID.generate()
    ) async throws -> HabitOccurrenceModel {
        try await request(
            path: "/productivity/habit-occurrences/\(id)/\(action)",
            method: "POST",
            body: ["idempotencyKey": .string(idempotencyKey)] as [String: JSONValue]
        )
    }

    func checkInHabit(id: String) async throws -> HabitModel {
        try await request(path: "/productivity/habits/\(id)/check-in", method: "POST")
    }

    func fetchGrowthOverview() async throws -> GrowthOverviewDTO {
        try await request(path: "/growth/overview")
    }

    func fetchGrowthProfile() async throws -> GrowthProfileDTO {
        try await request(path: "/growth/profile")
    }

    func fetchGrowthRewardPresetSettings() async throws -> [String: [String: GrowthRewardRuleDTO]] {
        try await request(path: "/growth/reward-presets/settings")
    }

    func fetchGrowthTaskRewardDefaults() async throws -> [GrowthTaskRewardDefaultDTO] {
        try await request(path: "/growth/task-reward-defaults")
    }

    func upsertGrowthTaskRewardDefault(
        taskListId: String?,
        coinReward: Int,
        accountXp: Int,
        enabled: Bool,
        skillAwards: [String: Int],
        itemAwards: [String: Int]
    ) async throws -> GrowthTaskRewardDefaultDTO {
        let body: [String: JSONValue] = [
            "taskListId": taskListId.map(JSONValue.string) ?? .null,
            "coinReward": .number(Double(max(0, coinReward))),
            "accountXp": .number(Double(max(0, accountXp))),
            "enabled": .bool(enabled),
            "skillAwards": .array(skillAwards.filter { $0.value >= 0 }.sorted { $0.key < $1.key }.map {
                .object(["skillId": .string($0.key), "xpReward": .number(Double($0.value))])
            }),
            "itemAwards": .array(itemAwards.filter { $0.value > 0 }.sorted { $0.key < $1.key }.map {
                .object(["itemId": .string($0.key), "quantity": .number(Double($0.value))])
            })
        ]
        return try await request(path: "/growth/task-reward-defaults", method: "POST", body: body)
    }

    func fetchGrowthEarningRules(sourceType: GrowthSourceType? = nil, sourceId: String? = nil) async throws -> [GrowthEarningRuleDTO] {
        var query: [String] = []
        if let sourceType { query.append("sourceType=\(sourceType.rawValue)") }
        if let sourceId {
            let encodedSourceId = sourceId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? sourceId
            query.append("sourceId=\(encodedSourceId)")
        }
        let path = query.isEmpty ? "/growth/earning-rules" : "/growth/earning-rules?\(query.joined(separator: "&"))"
        return try await request(path: path)
    }

    func previewGrowthReset(scope: GrowthResetScope, skillId: String?) async throws -> GrowthResetPreviewDTO {
        var body: [String: JSONValue] = ["scope": .string(scope.rawValue)]
        if let skillId { body["skillId"] = .string(skillId) }
        return try await request(path: "/growth/reset/preview", method: "POST", body: body)
    }

    func executeGrowthReset(
        scope: GrowthResetScope,
        skillId: String?,
        idempotencyKey: String,
        keepEarningRules: Bool,
        keepShopRewards: Bool
    ) async throws {
        var body: [String: JSONValue] = [
            "scope": .string(scope.rawValue),
            "idempotencyKey": .string(idempotencyKey),
            "keepEarningRules": .bool(keepEarningRules),
            "keepShopRewards": .bool(keepShopRewards)
        ]
        if let skillId { body["skillId"] = .string(skillId) }
        let _: GrowthResetResponse = try await request(path: "/growth/reset", method: "POST", body: body)
    }

    func fetchGrowthSkills() async throws -> [GrowthSkillDTO] {
        try await request(path: "/growth/skills")
    }

    func fetchGrowthAttributes() async throws -> [GrowthSkillDTO] {
        try await request(path: "/growth/attributes")
    }

    func fetchGrowthAttributeMappings(skillID: String? = nil) async throws -> [GrowthAttributeMappingDTO] {
        var path = "/growth/attribute-mappings"
        if let skillID {
            let encoded = skillID.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? skillID
            path += "?skillId=\(encoded)"
        }
        return try await request(path: path)
    }

    func fetchGrowthRewards() async throws -> [GrowthRewardDTO] {
        try await request(path: "/growth/rewards")
    }

    func fetchGrowthInventory() async throws -> [GrowthInventoryDTO] {
        try await request(path: "/growth/inventory")
    }

    func fetchGrowthLedger() async throws -> [GrowthLedgerDTO] {
        let page: CursorPageResponse<GrowthLedgerDTO> = try await request(path: "/growth/ledger?limit=50")
        return page.data
    }

    func fetchStudyCalendar(days: Int) async throws -> [StudyCalendarDayDTO] {
        try await request(path: "/dashboard/study-calendar?days=\(max(1, min(days, 365)))")
    }

    func fetchGrowthStatistics(fromDate: String, toDate: String) async throws -> GrowthStatisticsDTO {
        let from = fromDate.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? fromDate
        let to = toDate.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? toDate
        return try await request(path: "/growth/statistics?fromDate=\(from)&toDate=\(to)")
    }

    func fetchDecks() async throws -> [DeckModel] {
        let page: CursorPageResponse<DeckModel> = try await request(path: "/decks")
        return page.data
    }

    func fetchCards(deckId: String) async throws -> [CardModel] {
        let page: CursorPageResponse<CardModel> = try await request(path: "/decks/\(deckId)/cards")
        return page.data
    }

    func fetchDueCards(deckId: String) async throws -> [CardModel] {
        let items: [DueCardResponse] = try await request(path: "/study/due?deckId=\(deckId)")
        return items.map { item in
            var card = item.card
            card.reviewDirection = item.state.direction
            return card
        }
    }

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

    func restoreTrashBudgetTransaction(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/trash/budget-transactions/\(escapedPath(id))/restore", method: "POST")
    }

    func permanentlyDeleteTrashBudgetTransaction(id: String) async throws {
        let _: EmptyResponse = try await request(path: "/trash/budget-transactions/\(escapedPath(id))", method: "DELETE")
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

    func fetchStudySessionHistory() async throws -> [StudySessionHistoryItem] {
        let page: CursorPageResponse<StudySessionHistoryItem> = try await request(path: "/study/sessions?limit=50")
        return page.data
    }

    func fetchStudySessionDetails(sessionId: String) async throws -> StudySessionDetails {
        try await request(path: "/study/sessions/\(sessionId)")
    }

    func fetchNotifications() async throws -> [AppNotificationModel] {
        try await request(path: "/productivity/notifications")
    }

    func markNotificationRead(id: String) async throws {
        let _: AppNotificationModel = try await request(path: "/productivity/notifications/\(id)/read", method: "PATCH")
    }

    func markAllNotificationsRead() async throws {
        let _: EmptyResponse = try await request(path: "/productivity/notifications/read-all", method: "POST")
    }

    func createTaskReminder(taskId: String, remindAt: String, persistent: Bool = false) async throws -> TaskReminderModel {
        try await request(
            path: "/productivity/tasks/\(taskId)/reminders",
            method: "POST",
            body: [
                "remindAt": .string(remindAt),
                "persistent": .bool(persistent)
            ] as [String: JSONValue]
        )
    }

    func snoozeTaskReminder(id: String, remindAt: String) async throws {
        let _: TaskReminderModel = try await request(
            path: "/productivity/task-reminders/\(id)/snooze",
            method: "POST",
            body: ["remindAt": .string(remindAt)] as [String: JSONValue]
        )
    }

    func dismissTaskReminder(id: String) async throws {
        let _: TaskReminderModel = try await request(path: "/productivity/task-reminders/\(id)/dismiss", method: "POST")
    }

    func startStudySession(deckId: String, mode: String = "DUE") async throws -> String {
        let sessionId = ULID.generate()
        let _: EmptyResponse = try await request(
            path: "/study/sessions",
            method: "POST",
            body: [
                "id": .string(sessionId),
                "deckId": .string(deckId),
                "mode": .string(mode)
            ] as [String: JSONValue]
        )
        return sessionId
    }

    func submitReview(
        sessionId: String,
        cardId: String,
        grade: String,
        idempotencyKey: String = ULID.generate()
    ) async throws {
        let _: EmptyResponse = try await request(
            path: "/study/sessions/\(sessionId)/reviews",
            method: "POST",
            body: [
                "cardId": .string(cardId),
                "direction": .string("FRONT_TO_BACK"),
                "grade": .string(grade),
                "idempotencyKey": .string(idempotencyKey)
            ] as [String: JSONValue]
        )
    }

    func completeStudySession(sessionId: String, rating: Int) async throws {
        let _: EmptyResponse = try await request(
            path: "/study/sessions/\(sessionId)/complete",
            method: "POST",
            body: ["rating": .number(Double(max(1, min(10, rating))))] as [String: JSONValue]
        )
    }

    private func refresh() async throws -> AuthSession {
        if let refreshTask {
            return try await refreshTask.value
        }
        let storedRefresh = SessionCache.loadTokens().refreshToken
        let body: [String: JSONValue]? = storedRefresh != nil ? ["refreshToken": .string(storedRefresh!)] : nil
        let task = Task<AuthSession, Error> {
            try await request(
                path: "/auth/refresh",
                method: "POST",
                body: body,
                authorize: false,
                retryAfterUnauthorized: false
            )
        }
        refreshTask = task
        defer { refreshTask = nil }
        let refreshed: AuthSession
        do {
            refreshed = try await task.value
        } catch {
            if let apiError = error as? APIError, apiError.statusCode == 401 {
                accessToken = nil
                SessionCache.clearUser()
            }
            throw error
        }
        accessToken = refreshed.accessToken
        storeSession(refreshed)
        return refreshed
    }

    private func storeSession(_ session: AuthSession) {
        SessionCache.saveTokens(
            accessToken: session.accessToken,
            refreshToken: session.refreshToken
        )
    }

    private func request<RequestBody: Encodable, ResponseBody: Decodable>(
        path: String,
        method: String = "GET",
        body: RequestBody? = Optional<String>.none,
        authorize: Bool = true,
        retryAfterUnauthorized: Bool = true
    ) async throws -> ResponseBody {
        var request = try makeRequest(path: path, method: method, body: body, authorize: authorize)
        var (data, response) = try await session.data(for: request)
        guard var httpResponse = response as? HTTPURLResponse else {
            throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
        }

        if httpResponse.statusCode == 401, authorize, retryAfterUnauthorized {
            _ = try await refresh()
            request = try makeRequest(path: path, method: method, body: body, authorize: true)
            (data, response) = try await session.data(for: request)
            guard let retriedResponse = response as? HTTPURLResponse else {
                throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
            }
            httpResponse = retriedResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorBody = try? decoder.decode(APIErrorBody.self, from: data)
            throw APIError(
                statusCode: httpResponse.statusCode,
                message: errorBody?.message ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode),
                code: errorBody?.code,
                retryAfter: Self.retryAfter(from: httpResponse)
            )
        }
        if ResponseBody.self == EmptyResponse.self, data.isEmpty {
            return EmptyResponse() as! ResponseBody
        }
        return try decoder.decode(ResponseBody.self, from: data)
    }

    private func makeRequest<Body: Encodable>(
        path: String,
        method: String,
        body: Body?,
        authorize: Bool
    ) throws -> URLRequest {
        let baseURL = APIConfiguration.baseURL
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIError(statusCode: 0, message: "The API URL is invalid", code: nil)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authorize, let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    // MARK: - Journal

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

    func getJournalWeeklySummary(periodStart: String, periodEnd: String) async throws -> [String: JSONValue] {
        let start = periodStart.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? periodStart
        let end = periodEnd.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? periodEnd
        return try await request(path: "/journal/weekly-summary?periodStart=\(start)&periodEnd=\(end)")
    }

    func updateJournalPreferences(_ patch: [String: JSONValue]) async throws -> JournalPreferencesModel {
        try await request(path: "/preferences/journal", method: "PATCH", body: patch)
    }

    // MARK: - Budget & Gym

    func getBudgetOverview(period: String? = nil) async throws -> BudgetOverviewModel {
        let path: String
        if let period, let encoded = period.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            path = "/budget/overview?period=\(encoded)"
        } else {
            path = "/budget/overview"
        }
        return try await request(path: path)
    }

    func getBudgetCategories() async throws -> [BudgetCategoryModel] {
        return try await request(path: "/budget/categories")
    }

    func createBudgetCategory(name: String, type: String, icon: String, color: String) async throws -> BudgetCategoryModel {
        return try await request(
            path: "/budget/categories",
            method: "POST",
            body: [
                "name": .string(name),
                "type": .string(type),
                "icon": .string(icon),
                "color": .string(color)
            ] as [String: JSONValue]
        )
    }

    func updateBudgetCategory(id: String, name: String, type: String, icon: String, color: String) async throws -> BudgetCategoryModel {
        return try await request(
            path: "/budget/categories/\(escapedPath(id))",
            method: "PATCH",
            body: [
                "name": .string(name),
                "type": .string(type),
                "icon": .string(icon),
                "color": .string(color)
            ] as [String: JSONValue]
        )
    }

    func archiveBudgetCategory(id: String) async throws -> BudgetCategoryModel {
        return try await request(path: "/budget/categories/\(escapedPath(id))", method: "DELETE")
    }

    func getBudgetTransactions(period: String? = nil, categoryID: String? = nil, type: String? = nil) async throws -> [BudgetTransactionModel] {
        var items: [String] = []
        if let period, let encoded = period.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { items.append("period=\(encoded)") }
        if let categoryID, let encoded = categoryID.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { items.append("categoryId=\(encoded)") }
        if let type, let encoded = type.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) { items.append("type=\(encoded)") }
        let path = items.isEmpty ? "/budget/transactions" : "/budget/transactions?\(items.joined(separator: "&"))"
        return try await request(path: path)
    }

    func getGymOverview() async throws -> GymOverviewModel {
        return try await request(path: "/gym/overview")
    }

    func getGymExercises() async throws -> [ExerciseModel] {
        return try await request(path: "/gym/exercises")
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
        if let title {
            body["title"] = .string(title)
        }
        return try await request(path: "/gym/workouts", method: "POST", body: body)
    }

    private func escapedPath(_ value: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    private static func decimalString(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let number = Decimal(string: trimmed, locale: Locale(identifier: "en_US_POSIX")) else { return "0.00" }
        return NSDecimalNumber(decimal: number).rounding(accordingToBehavior: nil).stringValue
    }

    private static func retryAfter(from response: HTTPURLResponse) -> TimeInterval? {
        guard let raw = response.value(forHTTPHeaderField: "Retry-After") else { return nil }
        if let seconds = TimeInterval(raw) { return max(0, seconds) }
        guard let date = HTTPDateFormatter.date(from: raw) else { return nil }
        return max(0, date.timeIntervalSinceNow)
    }
}

private enum HTTPDateFormatter {
    static func date(from value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return formatter.date(from: value)
    }
}

private struct GrowthResetResponse: Decodable, Sendable {
    let id: String
}

struct EmptyResponse: Codable, Sendable {}

enum APIConfiguration {
    private static let baseURLKey = "apiBaseURL"
    private static let fallbackURL = URL(string: "http://localhost:3000")!

    static var baseURL: URL {
        guard
            let value = UserDefaults.standard.string(forKey: baseURLKey),
            let url = URL(string: value)
        else {
            return fallbackURL
        }
        return url
    }

    static func saveBaseURL(_ value: String) throws {
        guard let url = URL(string: value), let scheme = url.scheme, ["http", "https"].contains(scheme) else {
            throw APIError(statusCode: 0, message: "Enter a valid HTTP or HTTPS API URL", code: nil)
        }
        UserDefaults.standard.set(url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forKey: baseURLKey)
    }
}
